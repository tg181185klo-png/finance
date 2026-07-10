import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN } from "@/lib/constants";
import { updateStore } from "@/lib/server-store";
import type { Branch } from "@/lib/types";

function checkPin(pin?: string) {
  return pin === ADMIN_PIN;
}

export async function POST(req: NextRequest) {
  try {
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

    if (!checkPin(body.pin)) {
      return NextResponse.json({ error: "არასწორი კოდი" }, { status: 403 });
    }

    const branch = body.branch;

    const store = await updateStore((s) => {
      if (body.action === "setCash") {
        s.branchCash[branch] = {
          cash: body.cash ?? s.branchCash[branch].cash,
          card: body.card ?? s.branchCash[branch].card,
          bank: body.bank ?? s.branchCash[branch].bank,
        };
        return;
      }

      const code = body.productCode?.trim();
      if (!code) throw new Error("productCode საჭიროა");

      if (body.action === "setStock") {
        const qty = body.quantity ?? 0;
        if (qty === 0) delete s.inventory[branch][code];
        else s.inventory[branch][code] = qty;
      } else if (body.action === "adjustStock") {
        const delta = body.delta ?? 0;
        const cur = s.inventory[branch][code] ?? 0;
        const next = cur + delta;
        if (next === 0) delete s.inventory[branch][code];
        else s.inventory[branch][code] = next;
      }
    });

    return NextResponse.json({
      ok: true,
      inventory: store.inventory,
      branchCash: store.branchCash,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
