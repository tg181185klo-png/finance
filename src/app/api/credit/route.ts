import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/require-admin";
import { ENTRY_ACTION_PIN } from "@/lib/action-password";
import { OPERATIONAL_DATA_FROM } from "@/lib/report-config";
import { applyCreditDelivery, applyCreditPayment, isSettlementPaymentMethod } from "@/lib/utils";
import { updateStore } from "@/lib/server-store";
import type { Branch, PaymentMethod, SettlementPaymentMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminSession();
    if (authError) return authError;

    const body = (await req.json()) as {
      action: "pay" | "deliver" | "updatePaymentMethod" | "updateDueDate" | "updatePaidAt";
      saleId?: string;
      paymentId?: string;
      amount?: number;
      quantity?: number;
      note?: string;
      paymentMethod?: PaymentMethod;
      creditDueDate?: string;
      paidAt?: string;
      pin?: string;
      branch?: Branch;
    };

    if (body.action === "updatePaidAt") {
      const day = (body.paidAt ?? "").slice(0, 10);
      if (!body.paymentId) return NextResponse.json({ error: "ჩარიცხვა საჭიროა" }, { status: 400 });
      if ((body.pin ?? "").trim() !== ENTRY_ACTION_PIN) {
        return NextResponse.json({ error: "პაროლი არასწორია" }, { status: 400 });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < OPERATIONAL_DATA_FROM) {
        return NextResponse.json({ error: "თარიღი არასწორია" }, { status: 400 });
      }
      const paidAt = `${day}T12:00:00.000Z`;
      const store = await updateStore((s) => {
        const payment = (s.creditPayments ?? []).find((p) => p.id === body.paymentId);
        if (!payment) throw new Error("ჩარიცხვა ვერ მოიძებნა");
        payment.paidAt = paidAt;
        const linked = s.transactions.find(
          (t) => t.type === "deposit" && t.linkedCreditPaymentId === payment.id
        );
        if (linked && linked.type === "deposit") linked.date = paidAt;
      });
      return NextResponse.json({
        ok: true,
        creditPayments: store.creditPayments,
        transactions: store.transactions,
      });
    }

    if (body.action === "updateDueDate") {
      if (!body.saleId || !body.creditDueDate) {
        return NextResponse.json({ error: "saleId და creditDueDate საჭიროა" }, { status: 400 });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(body.creditDueDate)) {
        return NextResponse.json({ error: "თარიღი YYYY-MM-DD" }, { status: 400 });
      }
      const store = await updateStore((s) => {
        const sale = s.transactions.find((t) => t.id === body.saleId && t.type === "sale");
        if (!sale || sale.type !== "sale") throw new Error("შეკვეთა ვერ მოიძებნა");
        sale.creditDueDate = body.creditDueDate;
      });
      return NextResponse.json({ ok: true, transactions: store.transactions });
    }

    if (body.action === "updatePaymentMethod") {
      if (!body.paymentId || !body.paymentMethod) {
        return NextResponse.json({ error: "paymentId და paymentMethod საჭიროა" }, { status: 400 });
      }
      const valid: SettlementPaymentMethod[] = ["ქეში (ნაღდი)", "ბარათი", "ანგარიშზე ჩარიცხვა"];
      if (!valid.includes(body.paymentMethod as SettlementPaymentMethod)) {
        return NextResponse.json({ error: "დაფარვის მეთოდი: ქეში, ბარათი ან გადმორიცხვა" }, { status: 400 });
      }

      const store = await updateStore((s) => {
        const payment = (s.creditPayments ?? []).find((p) => p.id === body.paymentId);
        if (!payment) throw new Error("გადახდა ვერ მოიძებნა");
        payment.paymentMethod = body.paymentMethod as SettlementPaymentMethod;
        const linked = s.transactions.find(
          (t) => t.type === "deposit" && t.linkedCreditPaymentId === body.paymentId
        );
        if (linked && linked.type === "deposit") {
          linked.depositPaymentMethod = body.paymentMethod as SettlementPaymentMethod;
        }
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
        if (body.paymentMethod && !isSettlementPaymentMethod(body.paymentMethod)) {
          throw new Error("დაფარვა: ქეში, ბარათი ან გადმორიცხვა");
        }
        applyCreditPayment(s, saleId, amount, body.note, body.paymentMethod, body.branch, body.paidAt);
      } else if (body.action === "deliver") {
        const quantity = Number(body.quantity);
        if (!quantity || quantity <= 0) throw new Error("რაოდენობა საჭიროა");
        applyCreditDelivery(s, saleId, quantity, body.note, body.branch);
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
