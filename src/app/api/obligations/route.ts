import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN, BRANCHES } from "@/lib/constants";
import { addRecurringObligation, currentMonth, ensureMonthObligations, uid } from "@/lib/utils";
import { readStore, updateStore } from "@/lib/server-store";
import type { Expense, Obligation, PaymentMethod, ExpenseBranch } from "@/lib/types";

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
      obligation?: Omit<Obligation, "id" | "paid">;
      recurring?: boolean;
      action?: "pay";
      pin?: string;
      obligationId?: string;
      month?: string;
      amount?: number;
      paymentMethod?: PaymentMethod;
      branch?: ExpenseBranch;
      note?: string;
    };

    if (body.action === "pay") {
      if (body.pin !== ADMIN_PIN) {
        return NextResponse.json({ error: "არასწორი კოდი" }, { status: 403 });
      }
      const month = body.month || currentMonth();
      const amount = Number(body.amount);
      if (!amount || amount <= 0 || !body.obligationId) {
        return NextResponse.json({ error: "თანხა და ID საჭიროა" }, { status: 400 });
      }

      const store = await updateStore((s) => {
        ensureMonthObligations(s, month);
        const list = s.obligations[month];
        const ob = list?.find((o) => o.id === body.obligationId);
        if (!ob) throw new Error("ვალდებულება ვერ მოიძებნა");
        const left = ob.amount - ob.paid;
        const pay = Math.min(amount, left);
        if (pay <= 0) throw new Error("უკვე სრულად გადახდილია");

        const paymentMethod = body.paymentMethod ?? "ქეში (ნაღდი)";
        const source = body.branch ?? "საერთო";
        const paymentBranches = source === "საერთო" ? BRANCHES : [source];
        const totalCents = Math.round(pay * 100);
        const baseCents = Math.floor(totalCents / paymentBranches.length);
        let allocatedCents = 0;
        const paidAt = new Date().toISOString();

        ob.paid += pay;
        if (!s.obligationPayments) s.obligationPayments = [];

        for (let index = 0; index < paymentBranches.length; index += 1) {
          const isLast = index === paymentBranches.length - 1;
          const cents = isLast ? totalCents - allocatedCents : baseCents;
          allocatedCents += cents;
          const share = cents / 100;
          const branch = paymentBranches[index];
          const expenseId = uid();
          const note = body.note || `${ob.name} — ვალდებულების გასტუმრება`;
          const expense: Expense = {
            id: expenseId,
            type: "expense",
            date: paidAt,
            branch,
            category: ob.category,
            amount: share,
            comment: note,
            source: "admin",
            obligationId: ob.id,
            expensePaymentMethod: paymentMethod,
          };

          s.transactions = [expense, ...s.transactions];
          s.obligationPayments.push({
            id: uid(),
            obligationId: ob.id,
            expenseId,
            amount: share,
            paidAt,
            note,
            paymentMethod,
            branch,
          });
        }
      });

      return NextResponse.json({
        ok: true,
        obligations: store.obligations,
        obligationPayments: store.obligationPayments,
        transactions: store.transactions,
      });
    }

    if (!body.obligation) {
      return NextResponse.json({ error: "obligation საჭიროა" }, { status: 400 });
    }

    const month = body.obligation.month || currentMonth();
    let saved: Obligation | undefined;

    await updateStore((store) => {
      if (body.recurring) {
        addRecurringObligation(
          store,
          {
            name: body.obligation!.name,
            amount: body.obligation!.amount,
            branch: body.obligation!.branch,
            category: body.obligation!.category,
          },
          month
        );
        saved = store.obligations[month].at(-1);
      } else {
        saved = {
          ...body.obligation!,
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
