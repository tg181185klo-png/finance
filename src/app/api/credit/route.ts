import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/require-admin";
import { applyCreditDelivery, applyCreditPayment } from "@/lib/utils";
import { updateStore } from "@/lib/server-store";
import type { PaymentMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminSession();
    if (authError) return authError;

    const body = (await req.json()) as {
      action: "pay" | "deliver" | "updatePaymentMethod";
      saleId?: string;
      paymentId?: string;
      amount?: number;
      quantity?: number;
      note?: string;
      paymentMethod?: PaymentMethod;
    };

    if (body.action === "updatePaymentMethod") {
      if (!body.paymentId || !body.paymentMethod) {
        return NextResponse.json({ error: "paymentId და paymentMethod საჭიროა" }, { status: 400 });
      }
      const valid: PaymentMethod[] = ["ქეში (ნაღდი)", "ბარათი", "ანგარიშზე ჩარიცხვა"];
      if (!valid.includes(body.paymentMethod)) {
        return NextResponse.json({ error: "არასწორი გადახდის მეთოდი" }, { status: 400 });
      }

      const store = await updateStore((s) => {
        const payment = (s.creditPayments ?? []).find((p) => p.id === body.paymentId);
        if (!payment) throw new Error("გადახდა ვერ მოიძებნა");
        payment.paymentMethod = body.paymentMethod!;
      });

      return NextResponse.json({
        ok: true,
        creditPayments: store.creditPayments,
        transactions: store.transactions,
      });
    }

    if (!body.saleId || !body.action) {
      return NextResponse.json({ error: "saleId და action საჭიროა" }, { status: 400 });
    }

    const saleId = body.saleId;
    const store = await updateStore((s) => {
      if (body.action === "pay") {
        const amount = Number(body.amount);
        if (!amount || amount <= 0) throw new Error("თანხა საჭიროა");
        applyCreditPayment(s, saleId, amount, body.note, body.paymentMethod);
      } else if (body.action === "deliver") {
        const quantity = Number(body.quantity);
        if (!quantity || quantity <= 0) throw new Error("რაოდენობა საჭიროა");
        applyCreditDelivery(s, saleId, quantity, body.note);
      } else {
        throw new Error("არასწორი action");
      }
    });

    const sale = store.transactions.find((t) => t.id === saleId);
    return NextResponse.json({
      ok: true,
      sale,
      creditPayments: store.creditPayments,
      creditDeliveries: store.creditDeliveries,
      inventory: store.inventory,
      transactions: store.transactions,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
