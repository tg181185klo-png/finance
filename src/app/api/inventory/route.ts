import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN } from "@/lib/constants";
import { readStore, writeStore } from "@/lib/server-store";
import type { Branch } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    pin: string;
    action: "setStock" | "adjustStock" | "setCash";
    branch: Branch;
    productCode?: string;
    quantity?: number;
    delta?: number;
    cash?: number;
    card?: number;
    bank?: number;
  };

  if (body.pin !== ADMIN_PIN) {
    return NextResponse.json({ error: "არასწორი კოდი" }, { status: 403 });
  }

  const store = await readStore();
  const branch = body.branch;

  if (body.action === "setCash") {
    store.branchCash[branch] = {
      cash: body.cash ?? store.branchCash[branch].cash,
      card: body.card ?? store.branchCash[branch].card,
      bank: body.bank ?? store.branchCash[branch].bank,
    };
    await writeStore(store);
    return NextResponse.json({ ok: true, branchCash: store.branchCash });
  }

  const code = body.productCode?.trim();
  if (!code) return NextResponse.json({ error: "productCode საჭიროა" }, { status: 400 });

  if (body.action === "setStock") {
    const qty = body.quantity ?? 0;
    store.inventory[branch][code] = qty;
    if (qty === 0) delete store.inventory[branch][code];
  } else if (body.action === "adjustStock") {
    const delta = body.delta ?? 0;
    const cur = store.inventory[branch][code] ?? 0;
    const next = cur + delta;
    if (next === 0) delete store.inventory[branch][code];
    else store.inventory[branch][code] = next;
  }

  await writeStore(store);
  return NextResponse.json({ ok: true, inventory: store.inventory });
}
