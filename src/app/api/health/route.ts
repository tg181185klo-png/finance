import { NextResponse } from "next/server";
import { diagnoseStorage, readStore, storageMode } from "@/lib/server-store";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const store = await readStore();
    const diagnosis = await diagnoseStorage();
    return NextResponse.json({
      ok: true,
      storage: storageMode(),
      diagnosis,
      transactions: store.transactions.length,
      branchReports: store.branchReports.length,
      sheetId: env.googleSheetId,
      appUrl: env.appUrl || null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    const diagnosis = await diagnoseStorage().catch(() => null);
    return NextResponse.json({ ok: false, error: msg, diagnosis }, { status: 500 });
  }
}
