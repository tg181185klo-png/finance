import { NextRequest, NextResponse } from "next/server";
import { readStore } from "@/lib/server-store";
import { canBackupStore, createStoreBackup } from "@/lib/store-backup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET || process.env.ADMIN_PIN || "12345";
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const q = req.nextUrl.searchParams.get("secret") || "";
  // Vercel Cron sends Authorization: Bearer <CRON_SECRET> when configured
  if (bearer && bearer === secret) return true;
  if (q && q === secret) return true;
  // Vercel cron jobs include this header on Hobby+ when cron is defined
  if (req.headers.get("x-vercel-cron") === "1") return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!canBackupStore()) {
    return NextResponse.json({ error: "backup unavailable" }, { status: 503 });
  }

  try {
    const store = await readStore();
    const meta = await createStoreBackup(store, "daily", "cron");
    return NextResponse.json({ ok: true, backup: meta });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "backup failed" },
      { status: 500 }
    );
  }
}
