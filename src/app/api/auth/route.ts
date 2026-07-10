import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const { pin } = (await req.json()) as { pin?: string };
  if (!pin || pin !== ADMIN_PIN) {
    return NextResponse.json({ error: "არასწორი კოდი" }, { status: 403 });
  }
  return NextResponse.json({ ok: true });
}
