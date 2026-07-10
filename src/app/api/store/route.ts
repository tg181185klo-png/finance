import { NextResponse } from "next/server";
import { readStore } from "@/lib/server-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const store = await readStore();
  return NextResponse.json(store, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
