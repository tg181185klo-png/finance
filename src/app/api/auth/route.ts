import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  adminCredentials,
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifySessionToken,
} from "@/lib/auth-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!value || !(await verifySessionToken(value))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { username?: string; password?: string; pin?: string };
  const creds = adminCredentials();

  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? body.pin ?? "");

  if (username !== creds.username || password !== creds.password) {
    return NextResponse.json({ error: "არასწორი მომხმარებელი ან პაროლი" }, { status: 403 });
  }

  const session = await createSessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, session, sessionCookieOptions());
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
