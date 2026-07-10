import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN } from "@/lib/constants";
import { currentMonth, uid } from "@/lib/utils";
import { readStore, updateStore } from "@/lib/server-store";
import type { Obligation } from "@/lib/types";

export async function GET(req: NextRequest) {
  const month = new URL(req.url).searchParams.get("month") ?? currentMonth();
  const store = await readStore();
  return NextResponse.json({ month, items: store.obligations[month] ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { obligation: Omit<Obligation, "id" | "paid">; pin?: string };
    const month = body.obligation.month || currentMonth();

    const item: Obligation = {
      ...body.obligation,
      id: uid(),
      paid: 0,
      month,
    };

    await updateStore((store) => {
      if (!store.obligations[month]) store.obligations[month] = [];
      store.obligations[month].push(item);
    });

    return NextResponse.json({ ok: true, item });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const month = searchParams.get("month") ?? currentMonth();
  const pin = searchParams.get("pin");

  if (pin !== ADMIN_PIN) {
    return NextResponse.json({ error: "არასწორი კოდი" }, { status: 403 });
  }

  try {
    await updateStore((store) => {
      const list = store.obligations[month];
      if (!list) throw new Error("არ მოიძებნა");
      store.obligations[month] = list.filter((o) => o.id !== id);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    const status = msg === "არ მოიძებნა" ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
