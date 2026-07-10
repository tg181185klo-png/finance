import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN } from "@/lib/constants";
import { applyExpenseToObligations, applySaleToStock, uid } from "@/lib/utils";
import { updateStore } from "@/lib/server-store";
import type { Expense, Sale, Transaction } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { transaction: Transaction; migrate?: Transaction[] };
    let savedTx: Transaction | null = null;

    const store = await updateStore((s) => {
      if (body.migrate?.length) {
        s.transactions = [...body.migrate, ...s.transactions];
        return;
      }

      const t = { ...body.transaction };
      if (!t.id) t.id = uid();
      savedTx = t;

      if (t.type === "expense") {
        s.obligations = applyExpenseToObligations(s.obligations, t as Expense);
      } else {
        s.inventory = applySaleToStock(s.inventory, t as Sale, -1);
      }

      s.transactions = [t, ...s.transactions];
    });

    return NextResponse.json({
      ok: true,
      transaction: savedTx ?? body.transaction,
      obligations: store.obligations,
      inventory: store.inventory,
      transactions: store.transactions,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const pin = searchParams.get("pin");
  const reportId = searchParams.get("reportId");

  if (pin !== ADMIN_PIN) {
    return NextResponse.json({ error: "არასწორი კოდი" }, { status: 403 });
  }

  try {
    await updateStore((s) => {
      if (reportId) {
        const removed = s.transactions.filter((t) => t.reportId === reportId);
        for (const t of removed) {
          if (t.type === "sale") s.inventory = applySaleToStock(s.inventory, t, 1);
        }
        s.transactions = s.transactions.filter((t) => t.reportId !== reportId);
        s.branchReports = s.branchReports.filter((r) => r.id !== reportId);
        return;
      }

      if (!id) throw new Error("id საჭიროა");

      const removed = s.transactions.find((t) => t.id === id);
      s.transactions = s.transactions.filter((t) => t.id !== id);

      if (removed?.type === "sale") {
        s.inventory = applySaleToStock(s.inventory, removed, 1);
      }

      if (removed?.type === "expense" && removed.obligationId) {
        const month = removed.date.slice(0, 7);
        const list = s.obligations[month];
        if (list) {
          const ob = list.find((o) => o.id === removed.obligationId);
          if (ob) ob.paid = Math.max(0, ob.paid - removed.amount);
        }
      }
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
