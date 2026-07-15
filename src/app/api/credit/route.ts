import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN } from "@/lib/constants";
import { applyCreditDelivery, applyCreditPayment } from "@/lib/utils";
import { updateStore } from "@/lib/server-store";
import type { PaymentMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      pin: string;
      action: "pay" | "deliver";
      saleId: string;
      amount?: number;
      quantity?: number;
      note?: string;
      paymentMethod?: PaymentMethod;
    };

    if (body.pin !== ADMIN_PIN) {
      return NextResponse.json({ error: "არასწორი კოდი" }, { status: 403 });
    }

    if (!body.saleId || !body.action) {
      return NextResponse.json({ error: "saleId და action საჭიროა" }, { status: 400 });
    }

    const store = await updateStore((s) => {
      if (body.action === "pay") {
        const amount = Number(body.amount);
        if (!amount || amount <= 0) throw new Error("თანხა საჭიროა");
        applyCreditPayment(s, body.saleId, amount, body.note, body.paymentMethod);
      } else if (body.action === "deliver") {
        const quantity = Number(body.quantity);
        if (!quantity || quantity <= 0) throw new Error("რაოდენობა საჭიროა");
        applyCreditDelivery(s, body.saleId, quantity, body.note);
      } else {
        throw new Error("არასწორი action");
      }
    });

    const sale = store.transactions.find((t) => t.id === body.saleId);
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
