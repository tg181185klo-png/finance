import { NextRequest, NextResponse } from "next/server";
import { OPERATIONAL_DATA_FROM } from "@/lib/report-config";
import { DEFAULT_CARD_SPEND_TOKEN } from "@/lib/store-merge";
import { updateStore } from "@/lib/server-store";
import type { Expense } from "@/lib/types";
import { applyExpenseToStore, uid } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      token?: string;
      date?: string;
      amount?: number;
      comment?: string;
    };
    const token = (body.token ?? "").trim();
    const date = (body.date ?? "").slice(0, 10);
    const comment = (body.comment ?? "").trim();
    const amount = Number(body.amount);

    if (!token) return NextResponse.json({ error: "ლინკი არასწორია" }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < OPERATIONAL_DATA_FROM) {
      return NextResponse.json({ error: "თარიღი არასწორია" }, { status: 400 });
    }
    if (!comment) return NextResponse.json({ error: "კომენტარი საჭიროა" }, { status: 400 });
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "თანხა არასწორია" }, { status: 400 });
    }

    await updateStore((s) => {
      const expected = s.cardSpendToken || DEFAULT_CARD_SPEND_TOKEN;
      if (token !== expected) throw new Error("ლინკი არასწორია");
      const expense: Expense = {
        id: uid(),
        type: "expense",
        date: `${date}T12:00:00.000Z`,
        branch: "საერთო",
        category: "სხვა",
        amount,
        comment,
        recurrence: "ერთჯერადი",
        source: "admin",
        expensePaymentMethod: "ბარათი",
        spentBy: "მფლობელი",
      };
      applyExpenseToStore(s, expense);
      s.transactions = [expense, ...s.transactions];
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    const status = msg === "ლინკი არასწორია" ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
