import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN } from "@/lib/constants";
import { uid, applyExpenseToStore, applySaleToStock, reverseExpenseObligation } from "@/lib/utils";
import { branchByToken, dateOnly, readStore, updateStore } from "@/lib/server-store";
import type { BranchDailyReport, BranchExpenseLine, BranchSaleLine, Expense, Sale } from "@/lib/types";

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
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      token: string;
      date: string;
      sales?: BranchSaleLine[];
      expenses?: BranchExpenseLine[];
      salesTotal?: number;
      expensesTotal?: number;
      salesNote?: string;
      expensesNote?: string;
    };

    const preview = await readStore();
    const branch = branchByToken(preview, body.token);
    if (!branch) return NextResponse.json({ error: "არასწორი ლინკი" }, { status: 404 });

    const reportId = uid();
    const day = dateOnly(body.date || new Date().toISOString());
    const now = new Date().toISOString();
    const sales = body.sales ?? [];
    const expenses = body.expenses ?? [];

    const salesTotal = sales.length ? sales.reduce((s, x) => s + x.amount, 0) : (body.salesTotal || 0);
    const expensesTotal = expenses.length ? expenses.reduce((s, x) => s + x.amount, 0) : (body.expensesTotal || 0);

    const salesNote = sales.length
      ? sales.map((s) => `${s.productName} ×${s.quantity} (${s.paymentMethod})`).join("; ")
      : body.salesNote?.trim() || `დღის გაყიდვა — ${branch}`;

    const expensesNote = expenses.length
      ? expenses.map((e) => `${e.category}: ${e.comment} (${e.paymentMethod})`).join("; ")
      : body.expensesNote?.trim() || `დღის ხარჯი — ${branch}`;

    const report: BranchDailyReport = {
      id: reportId,
      branch,
      date: day,
      salesTotal,
      salesNote,
      expensesTotal,
      expensesNote,
      submittedAt: now,
      sales,
      expenses,
    };

    const txs: (Sale | Expense)[] = [];
    const txDate = `${day}T20:00:00.000Z`;

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
      };
      txs.push(sale);
    }

    if (!sales.length && salesTotal > 0) {
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
