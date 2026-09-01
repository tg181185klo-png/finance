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
import { buildClientSaleMeta } from "@/lib/branch-sales-sync";
import type {
  Branch,
  BranchClientSale,
  BranchDailyReport,
  BranchExpenseLine,
  BranchIncomeLine,
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

function reportExists(store: Store, branch: Branch, day: string) {
  return store.branchReports.some((r) => r.branch === branch && r.date === day);
}

function buildWageExpenseLine(employee: Employee, branch: Branch): BranchExpenseLine | null {
  const amount = wageForShift(employee.dailyWage, "დღის", branch);
  if (amount <= 0) return null;
  return {
    category: "ხელფასი",
    amount,
    paymentMethod: "ქეში (ნაღდი)",
    comment: `${employee.name} — დღიური ხელფასი`,
  };
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
  const day = dateOnly(body.date || new Date().toISOString());

  if (!body.skipDuplicateCheck && reportExists(preview, branch, day)) {
    return {
      error: "ამ დღის რეპორტი უკვე გაგზავნილია. ადმინმა შეუძლია წაშლა ან აღდგენა.",
      status: 400 as const,
    };
  }

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
  const now = new Date().toISOString();
  const incomes = body.incomes ?? [];
  const legacySales = body.sales ?? [];
  const expenses: BranchExpenseLine[] = [...(body.expenses ?? [])];

  const wageLine = buildWageExpenseLine(reportingEmployee, branch);
  if (wageLine && !expenses.some((e) => e.category === "ხელფასი" && e.comment.includes(reportingEmployee.name))) {
    expenses.push(wageLine);
  }

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
      : body.expensesNote?.trim() || `დღის ხარჯი — ${branch}`;

  const wageAmount = wageLine?.amount ?? 0;
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
  const txDate = `${day}T20:00:00.000Z`;

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
        employeeName: submittedBy,
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
        })
      );
    }
  });

  return { ok: true as const, report };
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token საჭიროა" }, { status: 400 });

  const store = await readStore();
  const branch = branchByToken(store, token);
  if (!branch) return NextResponse.json({ error: "არასწორი ლინკი" }, { status: 404 });

  const { products, error: productsError } = await fetchProductsFromGoogleSheets();

  return NextResponse.json(
    {
      branch,
      token,
      inventory: store.inventory[branch] ?? {},
      employees: (store.employees ?? []).filter((e) => e.branch === branch && e.active),
      attendance: (store.attendance ?? []).filter(
        (a) => a.branch === branch && a.date === new Date().toISOString().slice(0, 10)
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
      action?: "adminRestore";
      pin?: string;
      branch?: Branch;
    };

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
