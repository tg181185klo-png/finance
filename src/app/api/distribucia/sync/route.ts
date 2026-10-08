import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/require-admin";
import {
  DISTRIBUCIA_SYNC_FROM,
  applyDistribuciaOrders,
  buildDistribuciaPreview,
  fetchDistribuciaOrders,
  isDistribuciaSale,
} from "@/lib/distribucia-sync";
import { readStore, updateStore } from "@/lib/server-store";
import { assignSaleAccountSplit } from "@/lib/branch-payments";
import type { PaymentMethod, Sale } from "@/lib/types";

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
      auto?: boolean;
      action?: "updatePayment";
      orderId?: string;
      transactionId?: string;
      paymentMethod?: PaymentMethod;
      accountPaid?: number | null;
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
        const sales: Sale[] = [];
        for (const t of s.transactions) {
          if (!isDistribuciaSale(t) || t.type !== "sale") continue;
          const match =
            (body.transactionId && t.id === body.transactionId) ||
            (body.orderId && t.distribuciaOrderId === body.orderId);
          if (!match) continue;
          sales.push(t);
        }
        if (!sales.length) throw new Error("ჩანაწერი ვერ მოიძებნა");
        const method = body.paymentMethod!;
        const total = sales.reduce((sum, sale) => sum + sale.amount, 0);
        const accountPaid = body.accountPaid == null ? null : Number(body.accountPaid);
        if (method === "ანგარიშზე ჩარიცხვა" && accountPaid != null) {
          if (!Number.isFinite(accountPaid) || accountPaid < 0) throw new Error("ანგარიშის თანხა არასწორია");
          if (accountPaid > total + 0.02) throw new Error("ანგარიშზე გადმორიცხული შეკვეთის ჯამზე მეტია");
          if (accountPaid <= 0.009) {
            for (const sale of sales) {
              sale.paymentMethod = "ქეში (ნაღდი)";
              delete sale.accountPaid;
            }
          } else if (!assignSaleAccountSplit(sales, accountPaid)) {
            for (const sale of sales) {
              sale.paymentMethod = method;
              delete sale.accountPaid;
            }
          }
        } else {
          for (const sale of sales) {
            sale.paymentMethod = method;
            delete sale.accountPaid;
          }
        }
        updated = sales.length;
      });

      return NextResponse.json({ ok: true, updated, transactions: store.transactions });
    }

    const fromDate = parseFromDate(body.from ?? null);
    const orders = await fetchDistribuciaOrders();
    const preview = buildDistribuciaPreview(orders, fromDate);

    const current = await readStore();
    const first = applyDistribuciaOrders(current.transactions, orders, fromDate);
    if (first.unchanged) {
      return NextResponse.json({
        ok: true,
        unchanged: true,
        fromDate,
        imported: first.imported,
        removed: 0,
        orders: preview.orders,
        revenue: preview.revenue,
        days: preview.days.length,
      });
    }

    const store = await updateStore((s) => {
      const applied = applyDistribuciaOrders(s.transactions, orders, fromDate);
      if (applied.unchanged) return;
      s.transactions = applied.transactions;
    });

    return NextResponse.json({
      ok: true,
      unchanged: false,
      fromDate,
      imported: first.imported,
      removed: first.removed,
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
