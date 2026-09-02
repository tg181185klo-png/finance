import { branchSaleBuyerName } from "@/lib/customers";
import type {
  BranchClientSale,
  BranchDailyReport,
  BranchExpenseLine,
  BranchIncomeLine,
  BranchSaleLine,
  Expense,
  Sale,
  Store,
} from "@/lib/types";
import {
  applyExpenseToStore,
  applySaleToStock,
  reverseExpenseObligation,
  uid,
} from "@/lib/utils";

export type EmployeeSaleRow = {
  reportId: string;
  clientSaleId: string;
  date: string;
  branch: BranchDailyReport["branch"];
  submittedBy: string;
  submittedEmployeeId?: string;
  sale: BranchClientSale;
  total: number;
};

export function ensureClientSaleIds(report: BranchDailyReport): void {
  for (let i = 0; i < (report.clientSales ?? []).length; i++) {
    const sale = report.clientSales![i];
    if (!sale.clientSaleId) {
      sale.clientSaleId = `${report.id}-sale-${i}`;
    }
  }
}

export function buildClientSaleMeta(client: BranchClientSale): string {
  return [
    client.personType === "legal"
      ? client.companyId?.trim()
        ? `ს/კ: ${client.companyId.trim()}`
        : ""
      : "",
    client.phone?.trim()
      ? `ტელ: ${client.phone.trim()}`
      : client.contactPhone?.trim()
        ? `ტელ: ${client.contactPhone.trim()}`
        : "",
    client.personalId?.trim() ? `პირადი: ${client.personalId.trim()}` : "",
    client.comment?.trim() ? `კომენტარი: ${client.comment.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function recalculateReportTotals(report: BranchDailyReport): void {
  const clientSales = report.clientSales ?? [];
  const incomes = report.incomes ?? [];
  const legacySales = report.sales ?? [];
  const expenses = report.expenses ?? [];

  const salesFromClients = clientSales.reduce(
    (sum, c) => sum + c.products.reduce((s, p) => s + (p.amount || 0), 0),
    0
  );

  report.salesTotal = clientSales.length
    ? salesFromClients
    : incomes.length
      ? incomes.reduce((s, x) => s + x.amount, 0)
      : legacySales.length
        ? legacySales.reduce((s, x) => s + x.amount, 0)
        : 0;

  report.expensesTotal = expenses.reduce((s, x) => s + x.amount, 0);

  report.salesNote = clientSales.length
    ? clientSales
        .map((c) => {
          const name = branchSaleBuyerName(c);
          const prods = c.products.map((p) => `${p.productName} ×${p.quantity}`).join(", ");
          const note = c.comment?.trim();
          return note ? `${name}: ${prods} (${note})` : `${name}: ${prods}`;
        })
        .join("; ")
    : incomes.length
      ? incomes.map((i) => `${i.amount} ₾ (${i.paymentMethod})`).join("; ")
      : legacySales.length
        ? legacySales.map((s) => `${s.productName} ×${s.quantity} (${s.paymentMethod})`).join("; ")
        : report.salesNote;

  report.expensesNote =
    expenses.length > 0
      ? expenses.map((e) => `${e.category}: ${e.comment} (${e.paymentMethod})`).join("; ")
      : report.expensesNote;
}

function buildSaleTx(
  client: BranchClientSale,
  p: BranchSaleLine,
  report: BranchDailyReport,
  submittedBy: string,
  txDate: string
): Sale | null {
  if (!p.productCode || !p.quantity || p.amount <= 0) return null;
  const buyerName = branchSaleBuyerName(client);
  const meta = buildClientSaleMeta(client);
  return {
    id: uid(),
    type: "sale",
    date: txDate,
    branch: report.branch,
    productCode: p.productCode,
    productName: p.productName,
    quantity: p.quantity,
    unitPrice: p.unitPrice,
    amount: p.amount,
    paymentStatus: "სრულად გადახდილი",
    paymentMethod: p.paymentMethod || client.paymentMethod || "ქეში (ნაღდი)",
    comment: meta || `${p.productName} × ${p.quantity}`,
    buyerName,
    source: "branch",
    reportId: report.id,
    clientSaleId: client.clientSaleId,
    employeeName: submittedBy,
  };
}

export function buildReportTransactions(
  report: BranchDailyReport,
  submittedBy: string
): (Sale | Expense)[] {
  ensureClientSaleIds(report);
  const txDate = `${report.date}T20:00:00.000Z`;
  const txs: (Sale | Expense)[] = [];

  for (const client of report.clientSales ?? []) {
    for (const p of client.products) {
      const sale = buildSaleTx(client, p, report, submittedBy, txDate);
      if (sale) txs.push(sale);
    }
  }

  for (const income of report.incomes ?? []) {
    txs.push({
      id: uid(),
      type: "sale",
      date: txDate,
      branch: report.branch,
      productCode: "—",
      productName: "დღის შემოსავალი",
      quantity: 1,
      unitPrice: income.amount,
      amount: income.amount,
      paymentStatus: "სრულად გადახდილი",
      paymentMethod: income.paymentMethod,
      comment: `დღის შემოსავალი · ${income.paymentMethod}`,
      source: "branch",
      reportId: report.id,
      employeeName: submittedBy,
    });
  }

  if (!(report.clientSales ?? []).length) {
    for (const s of report.sales ?? []) {
      txs.push({
        id: uid(),
        type: "sale",
        date: txDate,
        branch: report.branch,
        productCode: s.productCode,
        productName: s.productName,
        quantity: s.quantity,
        unitPrice: s.unitPrice,
        amount: s.amount,
        paymentStatus: "სრულად გადახდილი",
        paymentMethod: s.paymentMethod,
        comment: `${s.productName} × ${s.quantity}`,
        source: "branch",
        reportId: report.id,
        employeeName: submittedBy,
      });
    }
  }

  for (const e of report.expenses ?? []) {
    txs.push({
      id: uid(),
      type: "expense",
      date: txDate,
      branch: report.branch,
      category: e.category,
      amount: e.amount,
      comment: e.comment,
      expensePaymentMethod: e.paymentMethod,
      recurrence: e.category === "ხელფასი" ? "ყოველთვიური" : "ერთჯერადი",
      source: "branch",
      reportId: report.id,
    });
  }

  return txs;
}

export function withoutAutoDailyWageExpenses(expenses: BranchExpenseLine[]): BranchExpenseLine[] {
  return expenses.filter(
    (e) => !(e.category === "ხელფასი" && e.comment.includes("დღიური ხელფასი"))
  );
}

export function syncReportTransactions(store: Store, reportId: string): BranchDailyReport {
  const report = store.branchReports.find((r) => r.id === reportId);
  if (!report) throw new Error("რეპორტი ვერ მოიძებნა");

  report.expenses = withoutAutoDailyWageExpenses(report.expenses ?? []);

  const oldTxs = store.transactions.filter((t) => t.reportId === reportId);
  for (const t of oldTxs) {
    if (t.type === "sale") {
      try {
        store.inventory = applySaleToStock(store.inventory, t, 1);
      } catch {
        // ignore stock reverse errors
      }
    } else if (t.type === "expense") {
      reverseExpenseObligation(store, t);
    }
  }
  store.transactions = store.transactions.filter((t) => t.reportId !== reportId);

  recalculateReportTotals(report);
  const submittedBy = report.submittedBy ?? "—";
  const newTxs = buildReportTransactions(report, submittedBy);

  for (const t of newTxs) {
    if (t.type === "sale") {
      store.inventory = applySaleToStock(store.inventory, t, -1);
    } else {
      applyExpenseToStore(store, t);
    }
  }

  store.transactions = [...newTxs, ...store.transactions];
  return report;
}

export function appendToBranchReport(
  store: Store,
  reportId: string,
  payload: {
    clientSales: BranchClientSale[];
    expenses: BranchExpenseLine[];
    incomes?: BranchIncomeLine[];
    legacySales?: BranchSaleLine[];
    reportingEmployee: { id: string; name: string; dailyWage?: number };
    now: string;
  }
): BranchDailyReport {
  const report = store.branchReports.find((r) => r.id === reportId);
  if (!report) throw new Error("რეპორტი ვერ მოიძებნა");

  ensureClientSaleIds(report);

  for (const c of payload.clientSales) {
    if (!c.clientSaleId) c.clientSaleId = uid();
    report.clientSales = [...(report.clientSales ?? []), c];
  }

  if (payload.incomes?.length) {
    report.incomes = [...(report.incomes ?? []), ...payload.incomes];
  }
  if (payload.legacySales?.length) {
    report.sales = [...(report.sales ?? []), ...payload.legacySales];
  }

  const mergedExpenses = withoutAutoDailyWageExpenses([
    ...(report.expenses ?? []),
    ...withoutAutoDailyWageExpenses(payload.expenses),
  ]);
  report.expenses = mergedExpenses;

  const dailyWage =
    payload.reportingEmployee.dailyWage ??
    store.employees?.find((e) => e.id === payload.reportingEmployee.id)?.dailyWage ??
    0;
  const wageAmount = Math.max(0, dailyWage);
  if (wageAmount > 0) {
    const worked = report.workedEmployees ?? [];
    if (!worked.some((w) => w.employeeId === payload.reportingEmployee.id)) {
      report.workedEmployees = [
        ...worked,
        {
          employeeId: payload.reportingEmployee.id,
          employeeName: payload.reportingEmployee.name,
          shift: "დღის",
          wageAmount,
        },
      ];
    }
  }

  recalculateReportTotals(report);
  report.submittedAt = payload.now;

  syncReportTransactions(store, reportId);
  return report;
}

export function listEmployeeSales(store: Store): EmployeeSaleRow[] {
  const rows: EmployeeSaleRow[] = [];
  for (const report of store.branchReports) {
    ensureClientSaleIds(report);
    for (const sale of report.clientSales ?? []) {
      const total = sale.products.reduce((s, p) => s + (p.amount || 0), 0);
      rows.push({
        reportId: report.id,
        clientSaleId: sale.clientSaleId!,
        date: report.date,
        branch: report.branch,
        submittedBy: report.submittedBy ?? "—",
        submittedEmployeeId: report.submittedEmployeeId,
        sale,
        total,
      });
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || b.total - a.total);
}

export function normalizeClientSaleProducts(sale: BranchClientSale): BranchClientSale {
  const products = sale.products.map((p) => {
    const quantity = Number(p.quantity) || 0;
    const unitPrice = Number(p.unitPrice) || 0;
    const amount = quantity * unitPrice;
    return { ...p, quantity, unitPrice, amount };
  });
  return { ...sale, products };
}

export function validateClientSale(sale: BranchClientSale): string | null {
  const personType = sale.personType ?? "physical";
  if (personType === "legal") {
    if (!sale.companyName?.trim() || !sale.companyId?.trim()) {
      return "კომპანიის დასახელება და ს/კ საჭიროა";
    }
  } else if (!sale.customerFirstName?.trim() || !sale.customerLastName?.trim() || !sale.phone?.trim()) {
    return "სახელი, გვარი და ტელეფონი საჭიროა";
  }
  const validProducts = sale.products.filter((p) => p.productCode && p.quantity > 0 && p.amount > 0);
  if (!validProducts.length) return "მინიმუმ ერთი პროდუქტი საჭიროა";
  return null;
}

export function updateClientSaleInStore(
  store: Store,
  reportId: string,
  clientSaleId: string,
  updated: BranchClientSale
): BranchDailyReport {
  const report = store.branchReports.find((r) => r.id === reportId);
  if (!report) throw new Error("რეპორტი ვერ მოიძებნა");
  ensureClientSaleIds(report);

  const normalized = normalizeClientSaleProducts({ ...updated, clientSaleId });
  const err = validateClientSale(normalized);
  if (err) throw new Error(err);

  const idx = (report.clientSales ?? []).findIndex((s) => s.clientSaleId === clientSaleId);
  if (idx < 0) throw new Error("გაყიდვა ვერ მოიძებნა");

  report.clientSales![idx] = normalized;
  return syncReportTransactions(store, reportId);
}

export function deleteClientSaleFromStore(
  store: Store,
  reportId: string,
  clientSaleId: string
): BranchDailyReport | null {
  const report = store.branchReports.find((r) => r.id === reportId);
  if (!report) throw new Error("რეპორტი ვერ მოიძებნა");
  ensureClientSaleIds(report);

  report.clientSales = (report.clientSales ?? []).filter((s) => s.clientSaleId !== clientSaleId);
  if (!report.clientSales.length && !(report.expenses?.length)) {
    return null;
  }
  return syncReportTransactions(store, reportId);
}
