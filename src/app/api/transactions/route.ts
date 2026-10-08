import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/require-admin";
import { updateClientSaleDriverInStore } from "@/lib/branch-sales-sync";
import { applyExpenseToStore, applySaleToStock, applyConsignmentToSale, applyCreditDelivery, reverseExpenseObligation, reverseCreditOrderData, markCreditOrderProgress, uid, isSettlementPaymentMethod, adjustStock, isCreditOrder, saleAffectsStock, saleCreditPaid, saleQuantityDelivered } from "@/lib/utils";
import { BRANCHES } from "@/lib/constants";
import { ENTRY_ACTION_PIN } from "@/lib/action-password";
import { deleteStoredTransaction } from "@/lib/activity-log";
import { OPERATIONAL_DATA_FROM } from "@/lib/report-config";
import { updateStore } from "@/lib/server-store";
import type { Branch, CreditPayment, Expense, PaymentMethod, Sale, Store, Transaction } from "@/lib/types";

export const dynamic = "force-dynamic";

function removeTransaction(s: Store, id: string) {
  return deleteStoredTransaction(s, id);
}

function assertActionPin(pin?: string) {
  if (pin !== ENTRY_ACTION_PIN) throw new Error("პაროლი არასწორია");
}

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminSession();
    if (authError) return authError;

    const body = (await req.json()) as {
      transaction?: Transaction;
      migrate?: Transaction[];
      action?:
        | "delete"
        | "updateRecurrence"
        | "updatePaymentMethod"
        | "updateCardExpense"
        | "updateSale"
        | "setCardFee"
        | "toggleBankLedgerReview"
        | "updateDriver";
      id?: string;
      date?: string;
      amount?: number;
      comment?: string;
      category?: string;
      ids?: string[];
      clientSaleId?: string;
      recurrence?: string;
      paymentMethod?: PaymentMethod;
      reviewed?: boolean;
      driverEmployeeId?: string;
      driverEmployeeName?: string;
      pin?: string;
      branch?: Branch;
      buyerName?: string;
      lines?: { id: string; quantity: number; unitPrice: number; productName?: string }[];
    };

    if (body.action === "delete") {
      const ids = [...new Set((body.ids?.length ? body.ids : body.id ? [body.id] : []).filter(Boolean))];
      if (!ids.length) {
        return NextResponse.json({ error: "id საჭიროა" }, { status: 400 });
      }
      assertActionPin(body.pin);
      const store = await updateStore((s) => {
        for (const id of ids) removeTransaction(s, id);
      });
      return NextResponse.json({
        ok: true,
        transactions: store.transactions,
        branchReports: store.branchReports,
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
      const valid: PaymentMethod[] = [
        "ქეში (ნაღდი)",
        "ბარათი",
        "ანგარიშზე ჩარიცხვა",
        "კონსიგნაცია",
      ];
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
            if (paymentMethod === "კონსიგნაცია") {
              applyConsignmentToSale(t, { alreadyStockedOut: true });
            } else {
              t.paymentMethod = paymentMethod;
            }
            updated += 1;
          } else if (t.type === "expense") {
            if (paymentMethod === "კონსიგნაცია") {
              throw new Error("ხარჯზე კონსიგნაცია შეუძლებელია");
            }
            t.expensePaymentMethod = paymentMethod;
            updated += 1;
          } else {
            if (paymentMethod === "კონსიგნაცია") {
              throw new Error("შენატანზე კონსიგნაცია შეუძლებელია");
            }
            t.depositPaymentMethod = paymentMethod;
            updated += 1;
          }
        }
        if (updated === 0) throw new Error("ჩანაწერი ვერ მოიძებნა");
      });

      return NextResponse.json({ ok: true, updated, transactions: store.transactions });
    }

    if (body.action === "updateCardExpense") {
      assertActionPin(body.pin);
      const date = (body.date ?? "").slice(0, 10);
      const comment = (body.comment ?? "").trim();
      const amount = Number(body.amount);
      if (!body.id) return NextResponse.json({ error: "id საჭიროა" }, { status: 400 });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < OPERATIONAL_DATA_FROM) {
        return NextResponse.json({ error: "თარიღი არასწორია" }, { status: 400 });
      }
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: "თანხა არასწორია" }, { status: 400 });
      }
      const store = await updateStore((s) => {
        const t = s.transactions.find((x) => x.id === body.id);
        if (!t || t.type !== "expense") {
          throw new Error("ჩანაწერი ვერ მოიძებნა");
        }
        const category = (body.category ?? t.category).trim();
        if (!category) throw new Error("კატეგორია საჭიროა");
        if (t.reportId) {
          const report = s.branchReports.find((r) => r.id === t.reportId);
          const line = report?.expenses?.find(
            (ex) => ex.amount === t.amount && ex.comment === t.comment && ex.category === t.category
          );
          if (line && report?.expenses) {
            line.amount = amount;
            line.comment = comment;
            line.category = category;
            report.expensesTotal = report.expenses.reduce((sum, ex) => sum + ex.amount, 0);
          }
        }
        reverseExpenseObligation(s, t);
        t.date = `${date}T12:00:00.000Z`;
        t.amount = amount;
        t.comment = comment;
        t.category = category;
        applyExpenseToStore(s, t);
      });
      return NextResponse.json({
        ok: true,
        transactions: store.transactions,
        obligations: store.obligations,
        branchReports: store.branchReports,
      });
    }

    if (body.action === "updateSale") {
      assertActionPin(body.pin);
      const date = (body.date ?? "").slice(0, 10);
      const branch = body.branch;
      const buyerName = (body.buyerName ?? "").trim();
      const comment = (body.comment ?? "").trim();
      const lines = body.lines ?? [];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < OPERATIONAL_DATA_FROM) {
        return NextResponse.json({ error: "თარიღი არასწორია" }, { status: 400 });
      }
      if (!branch || !BRANCHES.includes(branch)) {
        return NextResponse.json({ error: "ფილიალი არასწორია" }, { status: 400 });
      }
      if (!lines.length) return NextResponse.json({ error: "შემოსავალი საჭიროა" }, { status: 400 });

      const store = await updateStore((s) => {
        for (const line of lines) {
          const sale = s.transactions.find((t) => t.id === line.id && t.type === "sale");
          if (!sale || sale.type !== "sale") throw new Error("შემოსავალი ვერ მოიძებნა");
          const quantity = Number(line.quantity);
          const unitPrice = Number(line.unitPrice);
          if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("რაოდენობა არასწორია");
          if (!Number.isFinite(unitPrice) || unitPrice <= 0) throw new Error("ფასი არასწორია");
          const amount = Math.round(quantity * unitPrice * 100) / 100;
          const productName = (line.productName ?? sale.productName).trim();
          if (!productName) throw new Error("პროდუქტი საჭიროა");
          if (isCreditOrder(sale)) {
            if (quantity < saleQuantityDelivered(sale)) {
              throw new Error("რაოდენობა მიწოდებულზე ნაკლები ვერ იქნება");
            }
            if (amount + 0.001 < saleCreditPaid(sale)) {
              throw new Error("თანხა გადახდილზე ნაკლები ვერ იქნება");
            }
          } else if (saleAffectsStock(sale)) {
            s.inventory = adjustStock(s.inventory, sale.branch, sale.productCode, sale.quantity);
          }
          sale.date = `${date}T12:00:00.000Z`;
          sale.branch = branch;
          sale.buyerName = buyerName || undefined;
          sale.comment = comment;
          sale.quantity = quantity;
          sale.unitPrice = unitPrice;
          sale.amount = amount;
          sale.productName = productName;
          if (isCreditOrder(sale)) {
            markCreditOrderProgress(sale, sale.date);
          } else if (saleAffectsStock(sale)) {
            s.inventory = adjustStock(s.inventory, sale.branch, sale.productCode, -sale.quantity);
          }
        }
      });

      return NextResponse.json({
        ok: true,
        transactions: store.transactions,
        inventory: store.inventory,
      });
    }

    if (body.action === "setCardFee") {
      const ids = [...new Set((body.ids ?? []).filter(Boolean))].sort();
      const amount = Number(body.amount);
      if (!ids.length) return NextResponse.json({ error: "შემოსავალი საჭიროა" }, { status: 400 });
      if (!Number.isFinite(amount) || amount < 0) {
        return NextResponse.json({ error: "საკომისიო არასწორია" }, { status: 400 });
      }
      const store = await updateStore((s) => {
        const sales = s.transactions.filter((t) => t.type === "sale" && ids.includes(t.id));
        if (!sales.length) throw new Error("ბარათის შემოსავალი ვერ მოიძებნა");
        const key = ids.join("|");
        const existing = s.transactions.find(
          (t) => t.type === "expense" && (t.cardFeeSaleIds ?? []).slice().sort().join("|") === key
        );
        if (amount <= 0) {
          if (existing) removeTransaction(s, existing.id);
          return;
        }
        const names = [
          ...new Set(
            sales.map((t) => (t.type === "sale" ? t.buyerName || t.comment || t.productName : "")).filter(Boolean)
          ),
        ];
        const comment = `ბარათის საკომისიო${names.length ? ` · ${names.join(", ")}` : ""}`;
        const date = sales.map((t) => t.date).sort()[0] ?? new Date().toISOString();
        if (existing && existing.type === "expense") {
          reverseExpenseObligation(s, existing);
          existing.amount = amount;
          existing.comment = comment;
          existing.category = "საკომისიო";
          existing.expensePaymentMethod = "ბარათი";
          existing.branch = "საერთო";
          existing.date = date;
          applyExpenseToStore(s, existing);
          return;
        }
        const expense: Expense = {
          id: uid(),
          type: "expense",
          date,
          branch: "საერთო",
          category: "საკომისიო",
          amount,
          comment,
          recurrence: "ერთჯერადი",
          source: "admin",
          expensePaymentMethod: "ბარათი",
          cardFeeSaleIds: ids,
        };
        applyExpenseToStore(s, expense);
        s.transactions = [expense, ...s.transactions];
      });
      return NextResponse.json({ ok: true, transactions: store.transactions, obligations: store.obligations });
    }

    if (body.action === "toggleBankLedgerReview") {
      const ids = [
        ...(body.ids ?? []),
        ...(body.id ? [body.id] : []),
      ].filter((id, i, arr) => Boolean(id) && arr.indexOf(id) === i);

      if (ids.length === 0) {
        return NextResponse.json({ error: "id ან ids საჭიროა" }, { status: 400 });
      }

      const store = await updateStore((s) => {
        if (!s.bankLedgerReviewed) s.bankLedgerReviewed = {};
        const now = new Date().toISOString();
        const mark = body.reviewed !== false;
        for (const id of ids) {
          if (mark) s.bankLedgerReviewed![id] = now;
          else delete s.bankLedgerReviewed![id];
        }
      });
      return NextResponse.json({
        ok: true,
        bankLedgerReviewed: store.bankLedgerReviewed ?? {},
      });
    }

    if (body.action === "updateDriver") {
      if (!body.id) {
        return NextResponse.json({ error: "id საჭიროა" }, { status: 400 });
      }
      const driverEmployeeId = body.driverEmployeeId?.trim() ?? "";
      const driverEmployeeName = body.driverEmployeeName?.trim() ?? "";
      if (!driverEmployeeId || !driverEmployeeName) {
        return NextResponse.json({ error: "მომზიდავი თანამშრომელი საჭიროა" }, { status: 400 });
      }

      const store = await updateStore((s) => {
        const sale = s.transactions.find((t) => t.id === body.id && t.type === "sale");
        if (!sale || sale.type !== "sale") throw new Error("გაყიდვა ვერ მოიძებნა");

        if (sale.reportId && sale.clientSaleId) {
          try {
            updateClientSaleDriverInStore(
              s,
              sale.reportId,
              sale.clientSaleId,
              driverEmployeeId,
              driverEmployeeName
            );
            return;
          } catch {
            /* fall through — update txs directly */
          }
        }

        const groupId = sale.clientSaleId;
        for (const t of s.transactions) {
          if (t.type !== "sale") continue;
          const match = groupId ? t.clientSaleId === groupId : t.id === sale.id;
          if (match) t.employeeName = driverEmployeeName;
        }
      });

      return NextResponse.json({
        ok: true,
        transactions: store.transactions,
        branchReports: store.branchReports,
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
        if (sale.paymentMethod === "კონსიგნაცია") {
          applyConsignmentToSale(sale);
          s.transactions = [t, ...s.transactions];
          applyCreditDelivery(s, sale.id, sale.quantity, "კონსიგნაცია — სრული გატანა");
          return;
        } else if (sale.paymentStatus === "ბე (ავანსი)") {
          if (!s.creditPayments) s.creditPayments = [];
          if ((sale.creditPaid ?? 0) > 0) {
            const initial: CreditPayment = {
              id: uid(),
              saleId: sale.id,
              amount: sale.creditPaid!,
              paidAt: sale.date,
              note: sale.buyerName ? `ავანსი — ${sale.buyerName}` : "საწყისი ავანსი",
              paymentMethod: isSettlementPaymentMethod(sale.paymentMethod)
                ? sale.paymentMethod
                : "ქეში (ნაღდი)",
              branch: sale.branch,
            };
            s.creditPayments.push(initial);
            if (isSettlementPaymentMethod(initial.paymentMethod)) {
              s.transactions = [
                {
                  id: uid(),
                  type: "deposit",
                  date: sale.date,
                  branch: sale.branch,
                  amount: initial.amount,
                  kind: "other",
                  comment: initial.note || "ბე ავანსი",
                  source: "admin",
                  depositPaymentMethod: initial.paymentMethod,
                  linkedCreditPaymentId: initial.id,
                },
                ...s.transactions,
              ];
            }
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
    const status = msg === "ჩანაწერი ვერ მოიძებნა" ? 404 : msg === "პაროლი არასწორია" ? 400 : 500;
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
    assertActionPin(searchParams.get("pin") ?? undefined);
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
