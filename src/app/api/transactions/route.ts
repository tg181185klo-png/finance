import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/require-admin";
import { applyExpenseToStore, applySaleToStock, reverseExpenseObligation, reverseCreditOrderData, markCreditOrderProgress, uid } from "@/lib/utils";
import { updateStore } from "@/lib/server-store";
import type { CreditPayment, Expense, PaymentMethod, Sale, Store, Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

function removeTransaction(s: Store, id: string) {
  const removed = s.transactions.find((t) => t.id === id);
  if (!removed) throw new Error("ჩანაწერი ვერ მოიძებნა");

  s.transactions = s.transactions.filter((t) => t.id !== id);

  if (removed.type === "sale") {
    try {
      s.inventory = applySaleToStock(s.inventory, removed, 1);
    } catch {
      // მარაგის დაბრუნება არ უნდა დაბლოკოს წაშლა
    }
    reverseCreditOrderData(s, removed.id, removed);
  } else if (removed.type === "expense") {
    reverseExpenseObligation(s, removed);
  }

  return removed;
}

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminSession();
    if (authError) return authError;

    const body = (await req.json()) as {
      transaction?: Transaction;
      migrate?: Transaction[];
      action?: "delete" | "updateRecurrence" | "updatePaymentMethod" | "toggleBankLedgerReview";
      id?: string;
      clientSaleId?: string;
      recurrence?: string;
      paymentMethod?: PaymentMethod;
      reviewed?: boolean;
    };

    if (body.action === "delete") {
      if (!body.id) {
        return NextResponse.json({ error: "id საჭიროა" }, { status: 400 });
      }
      const store = await updateStore((s) => {
        removeTransaction(s, body.id!);
      });
      return NextResponse.json({
        ok: true,
        transactions: store.transactions,
        inventory: store.inventory,
        obligations: store.obligations,
        creditPayments: store.creditPayments,
        creditDeliveries: store.creditDeliveries,
      });
    }

    if (body.action === "updateRecurrence") {
      if (!body.id || !body.recurrence) {
        return NextResponse.json({ error: "id და recurrence საჭიროა" }, { status: 400 });
      }
      const store = await updateStore((s) => {
        const t = s.transactions.find((x) => x.id === body.id);
        if (!t) throw new Error("ჩანაწერი ვერ მოიძებნა");
        t.recurrence = body.recurrence as Sale["recurrence"];
      });
      return NextResponse.json({ ok: true, transactions: store.transactions });
    }

    if (body.action === "updatePaymentMethod") {
      const paymentMethod = body.paymentMethod as PaymentMethod | undefined;
      if (!paymentMethod) {
        return NextResponse.json({ error: "paymentMethod საჭიროა" }, { status: 400 });
      }
      if (!body.id && !body.clientSaleId) {
        return NextResponse.json({ error: "id ან clientSaleId საჭიროა" }, { status: 400 });
      }
      const valid: PaymentMethod[] = ["ქეში (ნაღდი)", "ბარათი", "ანგარიშზე ჩარიცხვა"];
      if (!valid.includes(paymentMethod)) {
        return NextResponse.json({ error: "არასწორი გადახდის მეთოდი" }, { status: 400 });
      }

      let updated = 0;
      const store = await updateStore((s) => {
        for (const t of s.transactions) {
          const match =
            (body.id && t.id === body.id) ||
            (body.clientSaleId && t.type === "sale" && t.clientSaleId === body.clientSaleId);
          if (!match) continue;
          if (t.type === "sale") {
            t.paymentMethod = paymentMethod;
            updated += 1;
          } else if (t.type === "expense") {
            t.expensePaymentMethod = paymentMethod;
            updated += 1;
          } else {
            t.depositPaymentMethod = paymentMethod;
            updated += 1;
          }
        }
        if (updated === 0) throw new Error("ჩანაწერი ვერ მოიძებნა");
      });

      return NextResponse.json({ ok: true, updated, transactions: store.transactions });
    }

    if (body.action === "toggleBankLedgerReview") {
      if (!body.id) {
        return NextResponse.json({ error: "id საჭიროა" }, { status: 400 });
      }
      const store = await updateStore((s) => {
        if (!s.bankLedgerReviewed) s.bankLedgerReviewed = {};
        if (body.reviewed === false || s.bankLedgerReviewed[body.id!]) {
          delete s.bankLedgerReviewed[body.id!];
        } else {
          s.bankLedgerReviewed[body.id!] = new Date().toISOString();
        }
      });
      return NextResponse.json({
        ok: true,
        bankLedgerReviewed: store.bankLedgerReviewed ?? {},
      });
    }

    let savedTx: Transaction | null = null;

    const store = await updateStore((s) => {
      if (body.migrate?.length) {
        s.transactions = [...body.migrate, ...s.transactions];
        return;
      }

      const t = { ...body.transaction! };
      if (!t.id) t.id = uid();
      savedTx = t;

      if (t.type === "expense") {
        applyExpenseToStore(s, t as Expense);
      } else if (t.type === "deposit") {
        // შენატანი — ცალკე სალაროში, ვალდებულებას არ ეხება
      } else {
        const sale = t as Sale;
        if (sale.paymentStatus === "ბე (ავანსი)") {
          if (!s.creditPayments) s.creditPayments = [];
          if ((sale.creditPaid ?? 0) > 0) {
            const initial: CreditPayment = {
              id: uid(),
              saleId: sale.id,
              amount: sale.creditPaid!,
              paidAt: sale.date,
              note: sale.buyerName ? `ავანსი — ${sale.buyerName}` : "საწყისი ავანსი",
              paymentMethod: sale.paymentMethod,
            };
            s.creditPayments.push(initial);
          }
          markCreditOrderProgress(sale, sale.date);
        } else {
          s.inventory = applySaleToStock(s.inventory, sale, -1);
        }
      }

      s.transactions = [t, ...s.transactions];
    });

    return NextResponse.json({
      ok: true,
      transaction: savedTx ?? body.transaction,
      obligations: store.obligations,
      inventory: store.inventory,
      transactions: store.transactions,
      creditPayments: store.creditPayments,
      creditDeliveries: store.creditDeliveries,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    const status = msg === "ჩანაწერი ვერ მოიძებნა" ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(req: NextRequest) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const reportId = searchParams.get("reportId");

  try {
    const store = await updateStore((s) => {
      if (reportId) {
        const removed = s.transactions.filter((t) => t.reportId === reportId);
        for (const t of removed) {
          if (t.type === "sale") {
            try {
              s.inventory = applySaleToStock(s.inventory, t, 1);
            } catch {
              // ignore stock reverse errors
            }
            reverseCreditOrderData(s, t.id, t);
          } else if (t.type === "expense") reverseExpenseObligation(s, t);
        }
        s.transactions = s.transactions.filter((t) => t.reportId !== reportId);
        s.branchReports = s.branchReports.filter((r) => r.id !== reportId);
        return;
      }

      if (!id) throw new Error("id საჭიროა");
      removeTransaction(s, id);
    });

    return NextResponse.json({
      ok: true,
      transactions: store.transactions,
      inventory: store.inventory,
      obligations: store.obligations,
      creditPayments: store.creditPayments,
      creditDeliveries: store.creditDeliveries,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "შეცდომა";
    const status = msg === "ჩანაწერი ვერ მოიძებნა" || msg === "id საჭიროა" ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
