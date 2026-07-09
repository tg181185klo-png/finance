import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN } from "@/lib/constants";
import { currentMonth, uid } from "@/lib/utils";
import { readStore, writeStore } from "@/lib/server-store";
import type { Obligation } from "@/lib/types";

export async function GET(req: NextRequest) {
  const month = new URL(req.url).searchParams.get("month") ?? currentMonth();
  const store = await readStore();
  return NextResponse.json({ month, items: store.obligations[month] ?? [] });
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { obligation: Omit<Obligation, "id" | "paid">; pin?: string };
  const store = await readStore();
  const month = body.obligation.month || currentMonth();

  const item: Obligation = {
    ...body.obligation,
    id: uid(),
    paid: 0,
    month,
  };

  if (!store.obligations[month]) store.obligations[month] = [];
  store.obligations[month].push(item);
  await writeStore(store);
  return NextResponse.json({ ok: true, item });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const month = searchParams.get("month") ?? currentMonth();
  const pin = searchParams.get("pin");

  if (pin !== ADMIN_PIN) {
    return NextResponse.json({ error: "არასწორი კოდი" }, { status: 403 });
  }

  const store = await readStore();
  const list = store.obligations[month];
  if (!list) return NextResponse.json({ error: "არ მოიძებნა" }, { status: 404 });

  store.obligations[month] = list.filter((o) => o.id !== id);
  await writeStore(store);
  return NextResponse.json({ ok: true });
}
