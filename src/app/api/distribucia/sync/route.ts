import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/require-admin";
import {
  DISTRIBUCIA_SYNC_FROM,
  buildDistribuciaPreview,
  fetchDistribuciaOrders,
  removeDistribuciaSales,
  ordersToSales,
} from "@/lib/distribucia-sync";
import { updateStore } from "@/lib/server-store";

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

    const body = (await req.json()) as { from?: string; replace?: boolean };
    const fromDate = parseFromDate(body.from ?? null);
    const orders = await fetchDistribuciaOrders();
    const preview = buildDistribuciaPreview(orders, fromDate);
    const newSales = ordersToSales(orders, fromDate);

    let removed = 0;
    const store = await updateStore((s) => {
      const kept = removeDistribuciaSales(s.transactions, fromDate);
      removed = s.transactions.length - kept.length;
      s.transactions = [...newSales, ...kept];
    });

    return NextResponse.json({
      ok: true,
      fromDate,
      imported: newSales.length,
      removed,
      orders: preview.orders,
      revenue: preview.revenue,
      days: preview.days.length,
      transactions: store.transactions,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "სინქრონიზაცია ვერ მოხერხდა";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
