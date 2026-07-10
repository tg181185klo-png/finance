import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN } from "@/lib/constants";
import { addRecurringObligation, currentMonth, ensureMonthObligations, uid } from "@/lib/utils";
import { readStore, updateStore } from "@/lib/server-store";
import type { Obligation } from "@/lib/types";

export async function GET(req: NextRequest) {
  const month = new URL(req.url).searchParams.get("month") ?? currentMonth();
  const store = await readStore();
  ensureMonthObligations(store, month);
  return NextResponse.json({
    month,
    items: store.obligations[month] ?? [],
    recurring: store.recurringObligations ?? [],
    payments: store.obligationPayments ?? [],
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      obligation: Omit<Obligation, "id" | "paid">;
      recurring?: boolean;
    };
    const month = body.obligation.month || currentMonth();

    let saved: Obligation | undefined;

    await updateStore((store) => {
      if (body.recurring) {
        addRecurringObligation(
          store,
          {
            name: body.obligation.name,
            amount: body.obligation.amount,
            branch: body.obligation.branch,
            category: body.obligation.category,
          },
          month
        );
        saved = store.obligations[month].at(-1);
      } else {
        saved = {
          ...body.obligation,
          id: uid(),
          paid: 0,
          month,
        };
        if (!store.obligations[month]) store.obligations[month] = [];
        store.obligations[month].push(saved);
      }
    });

    if (!saved) return NextResponse.json({ error: "შეცდომა" }, { status: 500 });
    return NextResponse.json({ ok: true, item: saved });
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
  const recurringId = searchParams.get("recurringId");

  if (pin !== ADMIN_PIN) {
    return NextResponse.json({ error: "არასწორი კოდი" }, { status: 403 });
  }

  try {
    await updateStore((store) => {
      if (recurringId) {
        store.recurringObligations = (store.recurringObligations ?? []).filter((r) => r.id !== recurringId);
        for (const m of Object.keys(store.obligations)) {
          store.obligations[m] = store.obligations[m].filter((o) => o.recurringId !== recurringId);
        }
        return;
      }
      if (!id) throw new Error("id საჭიროა");
      const list = store.obligations[month];
      if (!list) throw new Error("არ მოიძებნა");
      const removed = list.find((o) => o.id === id);
      store.obligations[month] = list.filter((o) => o.id !== id);
      if (removed?.recurringId) {
        store.recurringObligations = (store.recurringObligations ?? []).filter(
          (r) => r.id !== removed.recurringId
        );
      }
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    const status = msg === "არ მოიძებნა" ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
