import { NextRequest, NextResponse } from "next/server";
import { applyDistribuciaOrders, DISTRIBUCIA_SYNC_FROM, fetchDistribuciaOrders } from "@/lib/distribucia-sync";
import { readStore, updateStore } from "@/lib/server-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET || process.env.ADMIN_PIN || "12345";
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const q = req.nextUrl.searchParams.get("secret") || "";
  if (bearer && bearer === secret) return true;
  if (q && q === secret) return true;
  if (req.headers.get("x-vercel-cron") === "1") return true;
  return false;
}

/** დისტრიბუციის შეკვეთები იწერება ფინანსებში, როცა იქ რამე შეიცვალა */
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
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
