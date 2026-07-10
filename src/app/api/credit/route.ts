import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN } from "@/lib/constants";
import { applyCreditPayment } from "@/lib/utils";
import { updateStore } from "@/lib/server-store";
import type { PaymentMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      pin: string;
      saleId: string;
      amount: number;
      note?: string;
      paymentMethod?: PaymentMethod;
    };

    if (body.pin !== ADMIN_PIN) {
      return NextResponse.json({ error: "არასწორი კოდი" }, { status: 403 });
    }

    const amount = Number(body.amount);
    if (!body.saleId || !amount || amount <= 0) {
      return NextResponse.json({ error: "saleId და თანხა საჭიროა" }, { status: 400 });
    }

    const store = await updateStore((s) => {
      applyCreditPayment(s, body.saleId, amount, body.note, body.paymentMethod);
    });

    const sale = store.transactions.find((t) => t.id === body.saleId);
    return NextResponse.json({
      ok: true,
      sale,
      creditPayments: store.creditPayments,
      transactions: store.transactions,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
