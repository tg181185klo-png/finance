import { NextResponse } from "next/server";
import { readStore } from "@/lib/server-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await readStore();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
