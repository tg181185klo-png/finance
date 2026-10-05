import { NextRequest, NextResponse } from "next/server";
import { BRANCHES } from "@/lib/constants";
import { requireAdminSession } from "@/lib/require-admin";
import { addRecurringObligation, currentMonth, syncMonthObligationCycles, uid } from "@/lib/utils";
import { updateStore } from "@/lib/server-store";
import type { Expense, Obligation, PaymentMethod, ExpenseBranch, SettlementPaymentMethod } from "@/lib/types";
import { isSettlementPaymentMethod } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const month = new URL(req.url).searchParams.get("month") ?? currentMonth();
  const store = await updateStore((s) => {
    syncMonthObligationCycles(s, month);
  });
  return NextResponse.json({
    month,
    items: store.obligations[month] ?? [],
    recurring: store.recurringObligations ?? [],
    payments: store.obligationPayments ?? [],
  });
}

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminSession();
    if (authError) return authError;

    const body = (await req.json()) as {
      obligation?: Omit<Obligation, "id" | "paid">;
      recurring?: boolean;
      action?: "pay" | "update";
      name?: string;
      plannedPayDate?: string;
      obligationId?: string;
      month?: string;
      amount?: number;
      paymentMethod?: PaymentMethod;
      branch?: ExpenseBranch;
      note?: string;
    };

    if (body.action === "update") {
      const name = (body.name ?? "").trim();
      const plannedPayDate = (body.plannedPayDate ?? "").slice(0, 10);
      const amount = Number(body.amount);
      if (!body.obligationId) return NextResponse.json({ error: "ID საჭიროა" }, { status: 400 });
      if (!name) return NextResponse.json({ error: "ვალდებულება საჭიროა" }, { status: 400 });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(plannedPayDate)) {
        return NextResponse.json({ error: "ბოლო ვადა არასწორია" }, { status: 400 });
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: "თანხა არასწორია" }, { status: 400 });
      }
      const store = await updateStore((s) => {
        let found: Obligation | undefined;
        let fromMonth = "";
        for (const [month, list] of Object.entries(s.obligations)) {
          const ob = list.find((o) => o.id === body.obligationId);
          if (ob) {
            found = ob;
            fromMonth = month;
            break;
          }
        }
        if (!found) throw new Error("ვალდებულება ვერ მოიძებნა");
        if (amount < found.paid) throw new Error("თანხა გადახდილზე ნაკლები ვერ იქნება");
        found.name = name;
        found.amount = amount;
        found.plannedPayDate = plannedPayDate;
        const nextMonth = plannedPayDate.slice(0, 7);
        found.month = nextMonth;
        if (nextMonth !== fromMonth) {
          s.obligations[fromMonth] = (s.obligations[fromMonth] ?? []).filter((o) => o.id !== found!.id);
          if (!s.obligations[nextMonth]) s.obligations[nextMonth] = [];
          s.obligations[nextMonth].push(found);
        }
        if (found.recurringId) {
          const rec = (s.recurringObligations ?? []).find((r) => r.id === found!.recurringId);
          if (rec) {
            rec.name = name;
            rec.amount = amount;
            rec.plannedPayDate = plannedPayDate;
          }
        }
      });
      return NextResponse.json({ ok: true, obligations: store.obligations, recurringObligations: store.recurringObligations });
    }

    if (body.action === "pay") {
      const month = body.month || currentMonth();
      const amount = Number(body.amount);
      if (!amount || amount <= 0 || !body.obligationId) {
        return NextResponse.json({ error: "თანხა და ID საჭიროა" }, { status: 400 });
      }

      const store = await updateStore((s) => {
        syncMonthObligationCycles(s, month);
        const list = s.obligations[month];
        const ob = list?.find((o) => o.id === body.obligationId);
        if (!ob) throw new Error("ვალდებულება ვერ მოიძებნა");
        const left = ob.amount - ob.paid;
        const pay = Math.min(amount, left);
        if (pay <= 0) throw new Error("უკვე სრულად გადახდილია");

        const paymentMethodRaw = body.paymentMethod ?? "ქეში (ნაღდი)";
        if (!isSettlementPaymentMethod(paymentMethodRaw)) {
          throw new Error("გადახდის მეთოდი: ქეში, ბარათი ან გადმორიცხვა");
        }
        const paymentMethod: SettlementPaymentMethod = paymentMethodRaw;
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

    const store = await updateStore((s) => {
      if (body.recurring) {
        addRecurringObligation(
          s,
          {
            name: body.obligation!.name,
            amount: body.obligation!.amount,
            branch: body.obligation!.branch,
            category: body.obligation!.category,
            comment: body.obligation!.comment?.trim() || undefined,
            plannedPayDate: body.obligation!.plannedPayDate || undefined,
            plannedPaymentMethod: body.obligation!.plannedPaymentMethod || undefined,
            responsible: body.obligation!.responsible?.trim() || undefined,
          },
          month
        );
        saved = s.obligations[month].at(-1);
      } else {
        saved = {
          ...body.obligation!,
          id: uid(),
          paid: 0,
          month,
          comment: body.obligation!.comment?.trim() || undefined,
        };
        if (!s.obligations[month]) s.obligations[month] = [];
        s.obligations[month].push(saved);
      }
    });

    if (!saved) return NextResponse.json({ error: "შეცდომა" }, { status: 500 });
    return NextResponse.json({
      ok: true,
      item: saved,
      obligations: store.obligations,
      recurringObligations: store.recurringObligations,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const month = searchParams.get("month") ?? currentMonth();
  const recurringId = searchParams.get("recurringId");

  try {
    const store = await updateStore((store) => {
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
    return NextResponse.json({
      ok: true,
      obligations: store.obligations,
      recurringObligations: store.recurringObligations,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    const status = msg === "არ მოიძებნა" ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
