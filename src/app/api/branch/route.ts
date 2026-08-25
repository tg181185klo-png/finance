import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN } from "@/lib/constants";
import {
  uid,
  addEmployeeAttendance,
  applyExpenseToStore,
  applySaleToStock,
  reverseExpenseObligation,
} from "@/lib/utils";
import { branchByToken, dateOnly, readStore, updateStore } from "@/lib/server-store";
import type {
  BranchClientSale,
  BranchDailyReport,
  BranchExpenseLine,
  BranchIncomeLine,
  BranchSaleLine,
  Expense,
  Sale,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token საჭიროა" }, { status: 400 });

  const store = await readStore();
  const branch = branchByToken(store, token);
  if (!branch) return NextResponse.json({ error: "არასწორი ლინკი" }, { status: 404 });

  return NextResponse.json(
    {
      branch,
      token,
      inventory: store.inventory[branch] ?? {},
      employees: (store.employees ?? []).filter((e) => e.branch === branch && e.active),
      attendance: (store.attendance ?? []).filter(
        (a) => a.branch === branch && a.date === new Date().toISOString().slice(0, 10)
      ),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
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
      submittedBy?: string;
      submittedEmployeeId?: string;
      zeroReport?: boolean;
    };

    const preview = await readStore();
    const branch = branchByToken(preview, body.token);
    if (!branch) return NextResponse.json({ error: "არასწორი ლინკი" }, { status: 404 });

    const reportingEmployee = (preview.employees ?? []).find(
      (item) =>
        item.id === body.submittedEmployeeId &&
        item.branch === branch &&
        item.active
    );
    if (!reportingEmployee) {
      return NextResponse.json(
        { error: "აირჩიეთ ამ ფილიალში დამატებული თანამშრომელი" },
        { status: 400 }
      );
    }
    const submittedBy = reportingEmployee.name;

    const clientSales = (body.clientSales ?? []).filter(
      (c) =>
        c.customerFirstName?.trim() &&
        c.customerLastName?.trim() &&
        c.phone?.trim() &&
        (c.products?.length ?? 0) > 0
    );
    const day = dateOnly(body.date || new Date().toISOString());
    const now = new Date().toISOString();
    const incomes = body.incomes ?? [];
    const legacySales = body.sales ?? [];
    const expenses = body.expenses ?? [];

    const flatSalesFromClients: BranchSaleLine[] = clientSales.flatMap((c) =>
      c.products.map((p) => ({
        ...p,
        paymentMethod: p.paymentMethod || c.paymentMethod || "ქეში (ნაღდი)",
      }))
    );
    const sales = [...legacySales, ...flatSalesFromClients];

    const salesTotal = clientSales.length
      ? clientSales.reduce(
          (sum, c) => sum + c.products.reduce((s, p) => s + (p.amount || 0), 0),
          0
        )
      : incomes.length
        ? incomes.reduce((s, x) => s + x.amount, 0)
        : sales.length
          ? sales.reduce((s, x) => s + x.amount, 0)
          : body.salesTotal || 0;

    const expensesTotal = expenses.length
      ? expenses.reduce((s, x) => s + x.amount, 0)
      : body.expensesTotal || 0;

    const salesNote = clientSales.length
      ? clientSales
          .map((c) => {
            const name = `${c.customerFirstName} ${c.customerLastName}`.trim();
            const prods = c.products.map((p) => `${p.productName} ×${p.quantity}`).join(", ");
            return `${name}: ${prods}`;
          })
          .join("; ")
      : incomes.length
        ? incomes.map((i) => `${i.amount} ₾ (${i.paymentMethod})`).join("; ")
        : sales.length
          ? sales.map((s) => `${s.productName} ×${s.quantity} (${s.paymentMethod})`).join("; ")
          : body.salesNote?.trim() || (body.zeroReport ? "ნულოვანი რეპორტი — გაყიდვა არ ყოფილა" : `დღის შემოსავალი — ${branch}`);

    const expensesNote = expenses.length
      ? expenses.map((e) => `${e.category}: ${e.comment} (${e.paymentMethod})`).join("; ")
      : body.expensesNote?.trim() || `დღის ხარჯი — ${branch}`;

    // ნულოვანი რეპორტი დაშვებულია, თუ თანამშრომელი არჩეულია
    const hasContent =
      clientSales.length > 0 ||
      incomes.length > 0 ||
      sales.length > 0 ||
      expenses.length > 0 ||
      salesTotal > 0 ||
      expensesTotal > 0 ||
      body.zeroReport === true ||
      Boolean(reportingEmployee);

    if (!hasContent) {
      return NextResponse.json(
        { error: "გამოაგზავნეთ რეპორტი — მინიმუმ აირჩიეთ თანამშრომელი" },
        { status: 400 }
      );
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
      incomes,
      sales,
      clientSales,
      expenses,
    };

    const txs: (Sale | Expense)[] = [];
    const txDate = `${day}T20:00:00.000Z`;

    for (const client of clientSales) {
      const buyerName = `${client.customerFirstName.trim()} ${client.customerLastName.trim()}`.trim();
      const meta = [
        client.phone?.trim() ? `ტელ: ${client.phone.trim()}` : "",
        client.personalId?.trim() ? `პირადი: ${client.personalId.trim()}` : "",
      ]
        .filter(Boolean)
        .join(" · ");

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
        source: "branch",
        reportId,
      });
    }

    await updateStore((store) => {
      for (const t of txs) {
        if (t.type === "sale") {
          store.inventory = applySaleToStock(store.inventory, t, -1);
        } else {
          applyExpenseToStore(store, t);
        }
      }

      // გამომგზავნი თანამშრომელი — სამუშაო დღე (დღიური ხელფასი, ცვლების გარეშე)
      const employee = (store.employees ?? []).find(
        (item) => item.id === reportingEmployee.id && item.branch === branch && item.active
      );
      if (!employee) throw new Error("არჩეული თანამშრომელი ვერ მოიძებნა");
      addEmployeeAttendance(store, employee, day, "დღის", branch);

      store.branchReports = [report, ...store.branchReports];
      store.transactions = [...txs, ...store.transactions];
    });

    return NextResponse.json({ ok: true, report });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const reportId = searchParams.get("reportId");
  const pin = searchParams.get("pin");

  if (pin !== ADMIN_PIN) {
    return NextResponse.json({ error: "არასწორი კოდი" }, { status: 403 });
  }

  try {
    await updateStore((store) => {
      const removed = store.transactions.filter((t) => t.reportId === reportId);
      for (const t of removed) {
        if (t.type === "sale") store.inventory = applySaleToStock(store.inventory, t, 1);
        else reverseExpenseObligation(store, t);
      }
      store.transactions = store.transactions.filter((t) => t.reportId !== reportId);
      store.branchReports = store.branchReports.filter((r) => r.id !== reportId);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
