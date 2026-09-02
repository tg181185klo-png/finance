import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/require-admin";
import {
  DISTRIBUCIA_SYNC_FROM,
  buildDistribuciaPaymentMap,
  buildDistribuciaPreview,
  fetchDistribuciaOrders,
  isDistribuciaSale,
  removeDistribuciaSales,
  ordersToSales,
} from "@/lib/distribucia-sync";
import { updateStore } from "@/lib/server-store";
import type { PaymentMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseFromDate(raw: string | null) {
  const from = raw || DISTRIBUCIA_SYNC_FROM;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
    throw new Error("from: YYYY-MM-DD ფორმატი");
  }
  return from;
}

export async function GET(req: NextRequest) {
  try {
    const authError = await requireAdminSession();
    if (authError) return authError;

    const fromDate = parseFromDate(new URL(req.url).searchParams.get("from"));
    const orders = await fetchDistribuciaOrders();
    const preview = buildDistribuciaPreview(orders, fromDate);
    return NextResponse.json({ ok: true, ...preview });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "წაკითხვა ვერ მოხერხდა";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminSession();
    if (authError) return authError;

    const body = (await req.json()) as {
      from?: string;
      replace?: boolean;
      action?: "updatePayment";
      orderId?: string;
      transactionId?: string;
      paymentMethod?: PaymentMethod;
    };

    if (body.action === "updatePayment") {
      if (!body.paymentMethod) {
        return NextResponse.json({ error: "paymentMethod საჭიროა" }, { status: 400 });
      }
      if (!body.orderId && !body.transactionId) {
        return NextResponse.json({ error: "orderId ან transactionId საჭიროა" }, { status: 400 });
      }

      let updated = 0;
      const store = await updateStore((s) => {
        for (const t of s.transactions) {
          if (!isDistribuciaSale(t) || t.type !== "sale") continue;
          const match =
            (body.transactionId && t.id === body.transactionId) ||
            (body.orderId && t.distribuciaOrderId === body.orderId);
          if (!match) continue;
          t.paymentMethod = body.paymentMethod!;
          updated += 1;
        }
        if (updated === 0) throw new Error("ჩანაწერი ვერ მოიძებნა");
      });

      return NextResponse.json({ ok: true, updated, transactions: store.transactions });
    }

    const fromDate = parseFromDate(body.from ?? null);
    const orders = await fetchDistribuciaOrders();
    const preview = buildDistribuciaPreview(orders, fromDate);

    let removed = 0;
    let imported = 0;
    const store = await updateStore((s) => {
      const replacing = s.transactions.filter((t) => {
        if (!isDistribuciaSale(t)) return false;
        return t.date.slice(0, 10) >= fromDate;
      });
      const paymentMap = buildDistribuciaPaymentMap(replacing);
      const newSales = ordersToSales(orders, fromDate, "დისტრიბუცია", paymentMap);
      imported = newSales.length;
      const kept = removeDistribuciaSales(s.transactions, fromDate);
      removed = s.transactions.length - kept.length;
      s.transactions = [...newSales, ...kept];
    });

    return NextResponse.json({
      ok: true,
      fromDate,
      imported,
      removed,
      orders: preview.orders,
      revenue: preview.revenue,
      days: preview.days.length,
      transactions: store.transactions,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "სინქრონიზაცია ვერ მოხერხდა";
    const status = msg === "ჩანაწერი ვერ მოიძებნა" ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
