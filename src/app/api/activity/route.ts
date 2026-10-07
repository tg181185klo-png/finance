import { NextRequest, NextResponse } from "next/server";
import { applyActivityUndo, deleteStoredTransaction } from "@/lib/activity-log";
import { requireAdminSession } from "@/lib/require-admin";
import { updateStore } from "@/lib/server-store";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const body = (await req.json()) as { entryId?: string; txId?: string };

  try {
    const store = await updateStore((s) => {
      if (body.entryId) {
        const entry = (s.activityLog ?? []).find((e) => e.id === body.entryId);
        if (!entry) throw new Error("მოქმედება ვერ მოიძებნა");
        applyActivityUndo(s, entry);
        return;
      }
      if (body.txId) {
        deleteStoredTransaction(s, body.txId);
        return;
      }
      throw new Error("მოქმედება საჭიროა");
    });

    return NextResponse.json({
      ok: true,
      transactions: store.transactions,
      activityLog: store.activityLog,
      inventory: store.inventory,
      obligations: store.obligations,
      creditPayments: store.creditPayments,
      creditDeliveries: store.creditDeliveries,
      branchReports: store.branchReports,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    const status = msg === "ჩანაწერი ვერ მოიძებნა" || msg === "მოქმედება ვერ მოიძებნა" ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
