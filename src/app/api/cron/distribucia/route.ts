import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { applyDistribuciaOrders, DISTRIBUCIA_SYNC_FROM, fetchDistribuciaOrders } from "@/lib/distribucia-sync";
import { readStore, updateStore } from "@/lib/server-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** დისტრიბუციის შეკვეთები იწერება ფინანსებში, როცა იქ რამე შეიცვალა */
export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const orders = await fetchDistribuciaOrders();
    const current = await readStore();
    const first = applyDistribuciaOrders(current.transactions, orders, DISTRIBUCIA_SYNC_FROM);
    if (first.unchanged) {
      return NextResponse.json({ ok: true, unchanged: true, imported: first.imported });
    }
    await updateStore((s) => {
      const applied = applyDistribuciaOrders(s.transactions, orders, DISTRIBUCIA_SYNC_FROM);
      if (applied.unchanged) return;
      s.transactions = applied.transactions;
    });
    return NextResponse.json({ ok: true, unchanged: false, imported: first.imported });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sync failed" },
      { status: 500 }
    );
  }
}
