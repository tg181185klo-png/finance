import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN } from "@/lib/constants";
import { updateStore } from "@/lib/server-store";
import { emptyBranchCash } from "@/lib/utils";
import type { Branch, Store } from "@/lib/types";

export const dynamic = "force-dynamic";

function checkPin(pin?: string) {
  return pin === ADMIN_PIN;
}

function safeNum(value: unknown, fallback: number) {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

function ensureBranchBuckets(s: Store, branch: Branch) {
  if (!s.branchCash[branch]) s.branchCash[branch] = emptyBranchCash();
  if (!s.inventory[branch]) s.inventory[branch] = {};
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
      ensureBranchBuckets(s, branch);

      if (body.action === "setCash") {
        const cur = s.branchCash[branch];
        s.branchCash[branch] = {
          cash: body.cash !== undefined ? safeNum(body.cash, cur.cash) : cur.cash,
          card: body.card !== undefined ? safeNum(body.card, cur.card) : cur.card,
          bank: body.bank !== undefined ? safeNum(body.bank, cur.bank) : cur.bank,
        };
        return;
      }

      const code = body.productCode?.trim();
      if (!code) throw new Error("productCode საჭიროა");

      if (body.action === "setStock") {
        const qty = Math.max(0, safeNum(body.quantity, 0));
        if (qty === 0) delete s.inventory[branch][code];
        else s.inventory[branch][code] = qty;
      } else if (body.action === "adjustStock") {
        const delta = safeNum(body.delta, 0);
        const cur = s.inventory[branch][code] ?? 0;
        const next = Math.max(0, cur + delta);
        if (next === 0) delete s.inventory[branch][code];
        else s.inventory[branch][code] = next;
      }
    });

    return NextResponse.json(
      {
        ok: true,
        inventory: store.inventory,
        branchCash: store.branchCash,
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
