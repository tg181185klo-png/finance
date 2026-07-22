import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN } from "@/lib/constants";
import { uid, addEmployeeAttendance, applyExpenseToStore, applySaleToStock, reverseExpenseObligation, wageForShift } from "@/lib/utils";
import { branchByToken, dateOnly, readStore, updateStore } from "@/lib/server-store";
import type {
  BranchDailyReport,
  BranchExpenseLine,
  BranchIncomeLine,
  BranchSaleLine,
  BranchWorkedEmployee,
  Expense,
  Sale,
  WorkShift,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token საჭიროა" }, { status: 400 });

  const store = await readStore();
  const branch = branchByToken(store, token);
  if (!branch) return NextResponse.json({ error: "არასწორი ლინკი" }, { status: 404 });

  return NextResponse.json({
    branch,
    token,
    inventory: store.inventory[branch] ?? {},
    employees: (store.employees ?? []).filter((e) => e.branch === branch && e.active),
    attendance: (store.attendance ?? []).filter(
      (a) => a.branch === branch && a.date === new Date().toISOString().slice(0, 10)
    ),
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      token: string;
      date: string;
      incomes?: BranchIncomeLine[];
      sales?: BranchSaleLine[];
      expenses?: BranchExpenseLine[];
      salesTotal?: number;
      expensesTotal?: number;
      salesNote?: string;
      expensesNote?: string;
      submittedBy?: string;
      submittedEmployeeId?: string;
      shift?: WorkShift;
      shifts?: WorkShift[];
      workedEmployees?: { employeeId: string; shift?: WorkShift; shifts?: WorkShift[] }[];
    };

    const preview = await readStore();
    const branch = branchByToken(preview, body.token);
    if (!branch) return NextResponse.json({ error: "არასწორი ლინკი" }, { status: 404 });
    const requiresEmployee = branch === "ლილო" || branch === "დიღომი";
    const reportingEmployee = requiresEmployee
      ? (preview.employees ?? []).find(
          (item) =>
            item.id === body.submittedEmployeeId &&
            item.branch === branch &&
            item.active
        )
      : undefined;
    if (requiresEmployee && !reportingEmployee) {
      return NextResponse.json(
        { error: "აირჩიეთ ამ ფილიალში დამატებული თანამშრომელი" },
        { status: 400 }
      );
    }
    const submittedBy = reportingEmployee?.name ?? body.submittedBy?.trim() ?? undefined;

    const workedEntries = branch === "ქუთაისი"
      ? (body.workedEmployees ?? []).flatMap((item) => {
          const shifts = (item.shifts?.length ? item.shifts : [item.shift ?? "დღის"]) as WorkShift[];
          return [...new Set(shifts)].map((shift) => ({ employeeId: item.employeeId, shift }));
        })
      : [];
    const kutaisiWorked: BranchWorkedEmployee[] = [];
    for (const entry of workedEntries) {
      const emp = (preview.employees ?? []).find(
        (item) => item.id === entry.employeeId && item.branch === "ქუთაისი" && item.active
      );
      if (!emp) {
        return NextResponse.json(
          { error: "არჩეული თანამშრომელი არ ეკუთვნის ქუთაისს" },
          { status: 400 }
        );
      }
      kutaisiWorked.push({
        employeeId: emp.id,
        employeeName: emp.name,
        shift: entry.shift,
        wageAmount: wageForShift(emp.dailyWage, entry.shift),
      });
    }

    const reporterShifts: WorkShift[] = requiresEmployee
      ? [...new Set((body.shifts?.length ? body.shifts : [body.shift ?? "დღის"]) as WorkShift[])]
      : [];
    if (requiresEmployee && reporterShifts.length === 0) {
      return NextResponse.json({ error: "აირჩიეთ მინიმუმ ერთი ცვლა" }, { status: 400 });
    }

    const reportId = uid();
    const day = dateOnly(body.date || new Date().toISOString());
    const now = new Date().toISOString();
    const incomes = body.incomes ?? [];
    const sales = body.sales ?? [];
    const expenses = body.expenses ?? [];

    const salesTotal = incomes.length
      ? incomes.reduce((s, x) => s + x.amount, 0)
      : sales.length
        ? sales.reduce((s, x) => s + x.amount, 0)
        : (body.salesTotal || 0);
    const expensesTotal = expenses.length ? expenses.reduce((s, x) => s + x.amount, 0) : (body.expensesTotal || 0);

    const salesNote = incomes.length
      ? incomes.map((i) => `${i.amount} ₾ (${i.paymentMethod})`).join("; ")
      : sales.length
        ? sales.map((s) => `${s.productName} ×${s.quantity} (${s.paymentMethod})`).join("; ")
        : body.salesNote?.trim() || `დღის შემოსავალი — ${branch}`;

    const expensesNote = expenses.length
      ? expenses.map((e) => `${e.category}: ${e.comment} (${e.paymentMethod})`).join("; ")
      : body.expensesNote?.trim() || `დღის ხარჯი — ${branch}`;

    if (
      !incomes.length &&
      !sales.length &&
      !expenses.length &&
      salesTotal <= 0 &&
      expensesTotal <= 0 &&
      kutaisiWorked.length === 0
    ) {
      return NextResponse.json(
        { error: "დაამატეთ მინიმუმ ერთი შემოსავალი, ხარჯი ან თანამშრომელი" },
        { status: 400 }
      );
    }

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
      expenses,
      ...(kutaisiWorked.length ? { workedEmployees: kutaisiWorked } : {}),
    };

    const txs: (Sale | Expense)[] = [];
    const txDate = `${day}T20:00:00.000Z`;

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

    for (const s of sales) {
      const sale: Sale = {
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
      };
      txs.push(sale);
    }

    if (!incomes.length && !sales.length && salesTotal > 0) {
      txs.push({
        id: uid(),
        type: "sale",
        date: txDate,
        branch,
        productCode: "—",
        productName: "დღის გაყიდვები",
        quantity: 1,
        unitPrice: salesTotal,
        amount: salesTotal,
        paymentStatus: "სრულად გადახდილი",
        paymentMethod: "ქეში (ნაღდი)",
        comment: salesNote,
        source: "branch",
        reportId,
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

    if (!expenses.length && expensesTotal > 0) {
      txs.push({
        id: uid(),
        type: "expense",
        date: txDate,
        branch,
        category: "სხვა",
        amount: expensesTotal,
        comment: expensesNote,
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
      if (requiresEmployee && reportingEmployee) {
        const employee = (store.employees ?? []).find(
          (item) => item.id === reportingEmployee.id && item.branch === branch && item.active
        );
        if (!employee) throw new Error("არჩეული თანამშრომელი ვერ მოიძებნა");
        for (const workShift of reporterShifts) {
          addEmployeeAttendance(store, employee, day, workShift, branch);
        }
      }
      if (branch === "ქუთაისი") {
        for (const worked of kutaisiWorked) {
          const employee = (store.employees ?? []).find(
            (item) => item.id === worked.employeeId && item.branch === "ქუთაისი" && item.active
          );
          if (!employee) throw new Error(`${worked.employeeName} ვერ მოიძებნა`);
          addEmployeeAttendance(store, employee, day, worked.shift, branch);
        }
      }
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
