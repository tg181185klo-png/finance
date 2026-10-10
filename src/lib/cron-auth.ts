import type { NextRequest } from "next/server";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Nightly jobs accept only CRON_SECRET, or ADMIN_PIN if that is unset. */
export function authorizeCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET || process.env.ADMIN_PIN || "";
  if (!secret) return false;
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const q = req.nextUrl.searchParams.get("secret") || "";
  if (bearer && safeEqual(bearer, secret)) return true;
  if (q && safeEqual(q, secret)) return true;
  return false;
}
