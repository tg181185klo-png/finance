import { NextResponse } from "next/server";
import { readStore, storageMode } from "@/lib/server-store";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await readStore();
  return NextResponse.json({
    ok: true,
    storage: storageMode(),
    sheetId: env.googleSheetId,
    appUrl: env.appUrl || null,
  });
}
