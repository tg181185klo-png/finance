import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/require-admin";
import {
  uid,
  addEmployeeAttendance,
  applyExpenseToStore,
  applySaleToStock,
  removeEmployeeAttendance,
  reverseExpenseObligation,
  wageForShift,
} from "@/lib/utils";
import { fetchProductsFromGoogleSheets } from "@/lib/google-sheets";
import { branchByToken, dateOnly, readStore, updateStore } from "@/lib/server-store";
import { branchSaleBuyerName, customerFromBranchSale, upsertCustomer } from "@/lib/customers";
import { buildClientSaleMeta, appendToBranchReport, withoutAutoDailyWageExpenses, fixReportTimestampsForDay } from "@/lib/branch-sales-sync";
import { branchTransactionDate } from "@/lib/branch-tx-date";
import { branchDriverEmployees, branchReportEmployees, ensureConfiguredDriverEmployees } from "@/lib/branch-drivers";
import type {
  Branch,
  BranchClientSale,
  BranchDailyReport,
  BranchExpenseLine,
  BranchIncomeLine,
  BranchReportSubmission,
  BranchSaleLine,
  Employee,
  Expense,
  Sale,
  Store,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type SubmitBody = {
  token: string;
  date: string;
  linkDate?: string;
  incomes?: BranchIncomeLine[];
  sales?: BranchSaleLine[];
  clientSales?: BranchClientSale[];
  expenses?: BranchExpenseLine[];
  salesTotal?: number;
  expensesTotal?: number;
  salesNote?: string;
  expensesNote?: string;
  submittedEmployeeId?: string;
  zeroReport?: boolean;
  skipDuplicateCheck?: boolean;
};

function findDayReport(store: Store, branch: Branch, day: string) {
  return store.branchReports.find((r) => r.branch === branch && r.date === day);
}

function reportExists(store: Store, branch: Branch, day: string) {
  return Boolean(findDayReport(store, branch, day));
}

function recordSubmission(
  report: BranchDailyReport,
  employee: { id: string; name: string },
  at: string
) {
  const entry: BranchReportSubmission = {
    submittedAt: at,
    submittedEmployeeId: employee.id,
    submittedBy: employee.name,
  };
  report.submissionHistory = [...(report.submissionHistory ?? []), entry];
  report.submittedAt = at;
  report.submittedBy = employee.name;
  report.submittedEmployeeId = employee.id;
}

function parseClientSales(body: SubmitBody) {
  const clientSales = (body.clientSales ?? []).filter((c) => {
    const hasProducts = (c.products?.length ?? 0) > 0;
    if (!hasProducts) return false;
    const personType = c.personType ?? "physical";
    if (personType === "legal") {
      return Boolean(c.companyName?.trim() && c.companyId?.trim());
    }
    return Boolean(c.customerFirstName?.trim() && c.customerLastName?.trim() && c.phone?.trim());
  });
  for (const c of clientSales) {
    if (!c.clientSaleId) c.clientSaleId = uid();
  }
  return clientSales;
}

async function submitBranchReport(body: SubmitBody) {
  const preview = await readStore();
  const branch = branchByToken(preview, body.token);
  if (!branch) return { error: "არასწორი ლინკი", status: 404 as const };

  const reportingEmployee = (preview.employees ?? []).find(
    (item) =>
      item.id === body.submittedEmployeeId &&
      item.branch === branch &&
      item.active
  );
  if (!reportingEmployee) {
    return { error: "აირჩიეთ ამ ფილიალში დამატებული თანამშრომელი", status: 400 as const };
  }

  const submittedBy = reportingEmployee.name;
  const today = new Date().toISOString().slice(0, 10);
  const linkDate = body.linkDate ? dateOnly(body.linkDate) : undefined;
  const requestedDay = dateOnly(body.date || today);
  const lockedDay = linkDate || today;

  if (requestedDay !== lockedDay) {
    return { error: "თარიღის შეცვლა არ შეიძლება — გამოიყენეთ ადმინისგან გაგზავნილი ლინკი", status: 400 as const };
  }

  const day = lockedDay;
  const now = new Date().toISOString();
  const clientSales = parseClientSales(body);
  const incomes = body.incomes ?? [];
  const legacySales = body.sales ?? [];
  const existingReport = !body.skipDuplicateCheck ? findDayReport(preview, branch, day) : undefined;

  if (existingReport && body.zeroReport) {
    const mergeExpenses = withoutAutoDailyWageExpenses(body.expenses ?? []);
    const clientSalesEarly = parseClientSales(body);
    if (
      !clientSalesEarly.length &&
      !mergeExpenses.length &&
      !(body.incomes ?? []).length &&
      !(body.sales ?? []).length
    ) {
      let noopReport: BranchDailyReport | null = null;
      await updateStore((store) => {
        const report = store.branchReports.find((r) => r.id === existingReport.id);
        if (!report) throw new Error("რეპორტი ვერ მოიძებნა");
        const employee = (store.employees ?? []).find(
          (item) => item.id === reportingEmployee.id && item.branch === branch && item.active
        );
        if (!employee) throw new Error("არჩეული თანამშრომელი ვერ მოიძებნა");
        const hasAttendance = (store.attendance ?? []).some(
          (a) => a.employeeId === reportingEmployee.id && a.date === day
        );
        if (!hasAttendance) {
          addEmployeeAttendance(store, employee, day, "დღის", branch);
        }
        recordSubmission(report, reportingEmployee, now);
        noopReport = report;
      });
      return { ok: true as const, report: noopReport!, merged: true as const, noop: true as const };
    }
  }

  if (existingReport) {
    const mergeExpenses = withoutAutoDailyWageExpenses(body.expenses ?? []);
    if (
      !clientSales.length &&
      !mergeExpenses.length &&
      !incomes.length &&
      !legacySales.length
    ) {
      return { error: "დაამატეთ გაყიდვა ან ხარჯი", status: 400 as const };
    }
    let mergedReport: BranchDailyReport | null = null;
    await updateStore((store) => {
      const employee = (store.employees ?? []).find(
        (item) => item.id === reportingEmployee.id && item.branch === branch && item.active
      );
      if (!employee) throw new Error("არჩეული თანამშრომელი ვერ მოიძებნა");

      const hasAttendance = (store.attendance ?? []).some(
        (a) => a.employeeId === reportingEmployee.id && a.date === day
      );
      if (!hasAttendance) {
        addEmployeeAttendance(store, employee, day, "დღის", branch);
      }

      mergedReport = appendToBranchReport(store, existingReport.id, {
        clientSales,
        expenses: mergeExpenses,
        incomes,
        legacySales,
        reportingEmployee: {
          id: reportingEmployee.id,
          name: reportingEmployee.name,
          dailyWage: reportingEmployee.dailyWage,
        },
        now,
      });
      if (mergedReport) {
        recordSubmission(mergedReport, reportingEmployee, now);
      }

      if (!store.customers) store.customers = [];
      for (const client of clientSales) {
        const saleWithDriver: BranchClientSale = {
          ...client,
          personType: client.personType ?? "physical",
          driverEmployeeId: client.driverEmployeeId ?? reportingEmployee.id,
          driverEmployeeName: client.driverEmployeeName ?? reportingEmployee.name,
        };
        upsertCustomer(
          store,
          customerFromBranchSale(saleWithDriver, {
            branch,
            registeredByEmployeeId: reportingEmployee.id,
            registeredByEmployeeName: reportingEmployee.name,
            registeredAt: now,
            sourceClientSaleId: saleWithDriver.clientSaleId,
            sourceReportId: existingReport.id,
          })
        );
      }
    });

    return { ok: true as const, report: mergedReport!, merged: true as const };
  }

  const wageAmount = wageForShift(reportingEmployee.dailyWage, "დღის", branch);

  const expenses = withoutAutoDailyWageExpenses(body.expenses ?? []);

  const flatSalesFromClients: BranchSaleLine[] = clientSales.flatMap((c) =>
    c.products.map((p) => ({
      ...p,
      paymentMethod: p.paymentMethod || c.paymentMethod || "ქეში (ნაღდი)",
    }))
  );
  const sales = [...legacySales, ...flatSalesFromClients];

  const salesTotal = clientSales.length
    ? clientSales.reduce((sum, c) => sum + c.products.reduce((s, p) => s + (p.amount || 0), 0), 0)
    : incomes.length
      ? incomes.reduce((s, x) => s + x.amount, 0)
      : sales.length
        ? sales.reduce((s, x) => s + x.amount, 0)
        : body.salesTotal || 0;

  const expensesTotal = expenses.reduce((s, x) => s + x.amount, 0);

  const salesNote = clientSales.length
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
      : sales.length
        ? sales.map((s) => `${s.productName} ×${s.quantity} (${s.paymentMethod})`).join("; ")
        : body.salesNote?.trim() ||
          (body.zeroReport ? "ნულოვანი რეპორტი — გაყიდვა არ ყოფილა" : `დღის შემოსავალი — ${branch}`);

  const expensesNote =
    expenses.length > 0
      ? expenses.map((e) => `${e.category}: ${e.comment} (${e.paymentMethod})`).join("; ")
      : body.expensesNote?.trim() || (body.zeroReport ? "" : "");

  for (const c of clientSales) {
    c.recordedAt = now;
  }
  for (const e of expenses) {
    e.recordedAt = now;
  }

  const reportId = uid();
  const report: BranchDailyReport = {
    id: reportId,
    branch,
    date: day,
    salesTotal,
    salesNote,
    expensesTotal,
    expensesNote,
    submittedAt: now,
    submittedBy,
    submittedEmployeeId: reportingEmployee.id,
    submissionHistory: [
      {
        submittedAt: now,
        submittedEmployeeId: reportingEmployee.id,
        submittedBy,
      },
    ],
    incomes,
    sales,
    clientSales,
    expenses,
    workedEmployees: wageAmount
      ? [
          {
            employeeId: reportingEmployee.id,
            employeeName: reportingEmployee.name,
            shift: "დღის",
            wageAmount,
          },
        ]
      : [],
  };

  const txs: (Sale | Expense)[] = [];
  const txDate = branchTransactionDate(day, now);

  for (const client of clientSales) {
    const buyerName = branchSaleBuyerName(client);
    const meta = buildClientSaleMeta(client);

    for (const p of client.products) {
      if (!p.productCode || !p.quantity || p.amount <= 0) continue;
      txs.push({
        id: uid(),
        type: "sale",
        date: txDate,
        branch,
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
        reportId,
        clientSaleId: client.clientSaleId,
        employeeName: client.driverEmployeeName?.trim() || submittedBy,
      });
    }
  }

  for (const income of incomes) {
    txs.push({
      id: uid(),
      type: "sale",
      date: txDate,
      branch,
      productCode: "—",
      productName: "დღის შემოსავალი",
      quantity: 1,
      unitPrice: income.amount,
      amount: income.amount,
      paymentStatus: "სრულად გადახდილი",
      paymentMethod: income.paymentMethod,
      comment: `დღის შემოსავალი · ${income.paymentMethod}`,
      source: "branch",
      reportId,
      employeeName: submittedBy,
    });
  }

  for (const s of legacySales) {
    txs.push({
      id: uid(),
      type: "sale",
      date: txDate,
      branch,
      productCode: s.productCode,
      productName: s.productName,
      quantity: s.quantity,
      unitPrice: s.unitPrice,
      amount: s.amount,
      paymentStatus: "სრულად გადახდილი",
      paymentMethod: s.paymentMethod,
      comment: `${s.productName} × ${s.quantity}`,
      source: "branch",
      reportId,
      employeeName: submittedBy,
    });
  }

  for (const e of expenses) {
    txs.push({
      id: uid(),
      type: "expense",
      date: txDate,
      branch,
      category: e.category,
      amount: e.amount,
      comment: e.comment,
      expensePaymentMethod: e.paymentMethod,
      recurrence: e.category === "ხელფასი" ? "ყოველთვიური" : "ერთჯერადი",
      source: "branch",
      reportId,
    });
  }

  await updateStore((store) => {
    const employee = (store.employees ?? []).find(
      (item) => item.id === reportingEmployee.id && item.branch === branch && item.active
    );
    if (!employee) throw new Error("არჩეული თანამშრომელი ვერ მოიძებნა");

    addEmployeeAttendance(store, employee, day, "დღის", branch);

    for (const t of txs) {
      if (t.type === "sale") {
        store.inventory = applySaleToStock(store.inventory, t, -1);
      } else {
        applyExpenseToStore(store, t);
      }
    }

    store.branchReports = [report, ...store.branchReports];
    store.transactions = [...txs, ...store.transactions];

    if (!store.customers) store.customers = [];
    for (const client of clientSales) {
      const saleWithDriver: BranchClientSale = {
        ...client,
        personType: client.personType ?? "physical",
        driverEmployeeId: client.driverEmployeeId ?? reportingEmployee.id,
        driverEmployeeName: client.driverEmployeeName ?? reportingEmployee.name,
      };
      upsertCustomer(
        store,
        customerFromBranchSale(saleWithDriver, {
          branch,
          registeredByEmployeeId: reportingEmployee.id,
          registeredByEmployeeName: reportingEmployee.name,
          registeredAt: now,
          sourceClientSaleId: saleWithDriver.clientSaleId,
          sourceReportId: report.id,
        })
      );
    }
  });

  return { ok: true as const, report };
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const dayParam = url.searchParams.get("date");
  const day =
    dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam)
      ? dayParam
      : new Date().toISOString().slice(0, 10);
  if (!token) return NextResponse.json({ error: "token საჭიროა" }, { status: 400 });

  const store = await readStore();
  const branch = branchByToken(store, token);
  if (!branch) return NextResponse.json({ error: "არასწორი ლინკი" }, { status: 404 });

  let allEmployees = store.employees ?? [];
  const ensured = ensureConfiguredDriverEmployees(allEmployees);
  if (ensured.length !== allEmployees.length) {
    await updateStore((s) => {
      s.employees = ensured;
    });
    allEmployees = ensured;
  }

  const { products, error: productsError } = await fetchProductsFromGoogleSheets();

  return NextResponse.json(
    {
      branch,
      token,
      portalDate: day,
      inventory: store.inventory[branch] ?? {},
      employees: branchReportEmployees(branch, allEmployees),
      driverEmployees: branchDriverEmployees(branch, allEmployees),
      attendance: (store.attendance ?? []).filter(
        (a) => a.branch === branch && a.date === day
      ),
      products,
      productsWarning: productsError,
      productsCount: products.length,
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SubmitBody & {
      action?: "adminRestore" | "fixReportTimestamps";
      pin?: string;
      branch?: Branch;
      date?: string;
    };

    if (body.action === "fixReportTimestamps") {
      const authError = await requireAdminSession();
      if (authError) return authError;
      const day = dateOnly(body.date || "2026-09-02");
      let fixed = { reports: 0, transactions: 0 };
      const store = await updateStore((s) => {
        fixed = fixReportTimestampsForDay(s, day);
      });
      const sample = store.transactions
        .filter((t) => {
          const report = t.reportId ? store.branchReports.find((r) => r.id === t.reportId) : null;
          return report?.date === day || t.date.slice(0, 10) === day;
        })
        .slice(0, 8)
        .map((t) => ({ date: t.date, type: t.type, branch: t.branch }));
      return NextResponse.json({ ok: true, day, ...fixed, sample });
    }

    if (body.action === "adminRestore") {
      const authError = await requireAdminSession();
      if (authError) return authError;

      if (!body.branch || !body.submittedEmployeeId || !body.date) {
        return NextResponse.json(
          { error: "branch, submittedEmployeeId და date საჭიროა" },
          { status: 400 }
        );
      }
      const store = await readStore();
      const day = dateOnly(body.date);
      if (reportExists(store, body.branch, day)) {
        return NextResponse.json(
          { error: "ამ დღის რეპორტი უკვე არსებობს — ჯერ წაშალეთ, შემდეგ აღადგინეთ" },
          { status: 400 }
        );
      }
      const token = store.branchTokens[body.branch];
      if (!token) {
        return NextResponse.json({ error: "ფილიალის token ვერ მოიძებნა" }, { status: 400 });
      }
      const result = await submitBranchReport({
        token,
        date: day,
        submittedEmployeeId: body.submittedEmployeeId,
        zeroReport: true,
        clientSales: [],
        expenses: [],
        skipDuplicateCheck: false,
      });
      if ("error" in result && !("ok" in result)) {
        return NextResponse.json({ error: result.error }, { status: result.status });
      }
      return NextResponse.json(result);
    }

    if (!body.token) {
      return NextResponse.json({ error: "token საჭიროა" }, { status: 400 });
    }

    const result = await submitBranchReport(body);
    if ("error" in result && !("ok" in result)) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const reportId = searchParams.get("reportId");

  try {
    await updateStore((store) => {
      const report = store.branchReports.find((r) => r.id === reportId);
      const removed = store.transactions.filter((t) => t.reportId === reportId);
      for (const t of removed) {
        if (t.type === "sale") store.inventory = applySaleToStock(store.inventory, t, 1);
        else if (t.type === "expense") reverseExpenseObligation(store, t);
      }
      store.transactions = store.transactions.filter((t) => t.reportId !== reportId);

      if (report?.submittedEmployeeId) {
        const att = (store.attendance ?? []).find(
          (a) => a.employeeId === report.submittedEmployeeId && a.date === report.date
        );
        if (att) removeEmployeeAttendance(store, att.id);
      }

      store.branchReports = store.branchReports.filter((r) => r.id !== reportId);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
