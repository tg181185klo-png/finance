import { NextRequest, NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";
import { readStore } from "@/lib/server-store";
import { canBackupStore, ensureDailyStoreBackup, pruneStoreBackups } from "@/lib/store-backup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!authorizeCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canBackupStore()) {
    return NextResponse.json({ error: "backup unavailable" }, { status: 503 });
  }

  try {
    const store = await readStore();
    await ensureDailyStoreBackup(store);
    await pruneStoreBackups(20);
    return NextResponse.json({ ok: true, transactions: store.transactions?.length ?? 0 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "backup failed" },
      { status: 500 }
    );
  }
}
