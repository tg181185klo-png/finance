import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN } from "@/lib/constants";
import { applyExpenseToObligations, uid } from "@/lib/utils";
import { readStore, writeStore } from "@/lib/server-store";
import type { Expense, Sale, Transaction } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { transaction: Transaction; migrate?: Transaction[] };
  const store = await readStore();

  if (body.migrate?.length) {
    store.transactions = [...body.migrate, ...store.transactions];
    await writeStore(store);
    return NextResponse.json({ ok: true, migrated: body.migrate.length });
  }

  const t = { ...body.transaction };
  if (!t.id) t.id = uid();

  if (t.type === "expense") {
    store.obligations = applyExpenseToObligations(store.obligations, t as Expense);
  }

  store.transactions = [t, ...store.transactions];
  await writeStore(store);
  return NextResponse.json({ ok: true, transaction: t, obligations: store.obligations });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const pin = searchParams.get("pin");
  const reportId = searchParams.get("reportId");

  if (pin !== ADMIN_PIN) {
    return NextResponse.json({ error: "არასწორი კოდი" }, { status: 403 });
  }

  const store = await readStore();

  if (reportId) {
    store.transactions = store.transactions.filter((t) => t.reportId !== reportId);
    store.branchReports = store.branchReports.filter((r) => r.id !== reportId);
    await writeStore(store);
    return NextResponse.json({ ok: true, deleted: reportId });
  }

  if (!id) return NextResponse.json({ error: "id საჭიროა" }, { status: 400 });

  const removed = store.transactions.find((t) => t.id === id);
  store.transactions = store.transactions.filter((t) => t.id !== id);

  if (removed?.type === "expense" && removed.obligationId) {
    const month = removed.date.slice(0, 7);
    const list = store.obligations[month];
    if (list) {
      const ob = list.find((o) => o.id === removed.obligationId);
      if (ob) ob.paid = Math.max(0, ob.paid - removed.amount);
    }
  }

  await writeStore(store);
  return NextResponse.json({ ok: true });
}
