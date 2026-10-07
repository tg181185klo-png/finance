import type {
  ActivityEntry,
  CreditDelivery,
  CreditPayment,
  Store,
  Transaction,
} from "./types";
import {
  adjustStock,
  applyExpenseToStore,
  applySaleToStock,
  formatDate,
  formatMoney,
  isCreditOrder,
  reverseCreditOrderData,
  reverseExpenseObligation,
  saleQuantityDelivered,
  uid,
} from "./utils";

const LOG_LIMIT = 400;

export type ActionView = {
  key: string;
  at: string;
  kind: ActivityEntry["kind"];
  title: string;
  detail: string;
  undone: boolean;
  canUndo: boolean;
  entryId?: string;
  txId?: string;
};

function txName(t: Transaction) {
  if (t.type === "sale") return t.buyerName?.trim() || t.productName || t.comment || "შემოსავალი";
  if (t.type === "expense") return t.comment?.trim() || t.category || "ხარჯი";
  return t.comment?.trim() || "შენატანი";
}

export function actionTitle(kind: ActivityEntry["kind"], t: Transaction) {
  if (t.type === "deposit" && t.linkedCreditPaymentId) {
    if (kind === "create") return "ბე დაფარვა — ჩაწერა";
    if (kind === "delete") return "ბე დაფარვა — წაშლა";
    return "ბე დაფარვა — შეცვლა";
  }
  const what = t.type === "sale" ? "შემოსავალი" : t.type === "expense" ? "ხარჯი" : "შენატანი";
  const verb = kind === "create" ? "ჩაწერა" : kind === "update" ? "შეცვლა" : "წაშლა";
  return `${what} — ${verb}`;
}

export function actionDetail(t: Transaction) {
  return `${formatDate(t.date)} · ${t.branch} · ${txName(t)} · ${formatMoney(t.amount)}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** ერთი ჩანაწერის წაშლა. გაყიდვა შენატანს აღარ წაშლის. */
export function deleteStoredTransaction(s: Store, id: string): Transaction {
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
  } else if (removed.type === "deposit" && removed.linkedCreditPaymentId) {
    const payment = (s.creditPayments ?? []).find((p) => p.id === removed.linkedCreditPaymentId);
    if (payment) {
      const sale = s.transactions.find((t) => t.type === "sale" && t.id === payment.saleId);
      if (sale && sale.type === "sale") {
        sale.creditPaid = Math.max(0, (sale.creditPaid ?? 0) - payment.amount);
        sale.creditCompletedAt = undefined;
        sale.orderCompletedAt = undefined;
        if (sale.paymentStatus === "სრულად გადახდილი") sale.paymentStatus = "ბე (ავანსი)";
      }
      s.creditPayments = (s.creditPayments ?? []).filter((p) => p.id !== payment.id);
    }
  } else if (removed.type === "expense") {
    reverseExpenseObligation(s, removed);
    if (removed.reportId) {
      const report = s.branchReports.find((r) => r.id === removed.reportId);
      if (report?.expenses?.length) {
        const idx = report.expenses.findIndex(
          (ex) =>
            ex.amount === removed.amount &&
            ex.comment === removed.comment &&
            ex.category === removed.category
        );
        if (idx >= 0) {
          report.expenses = report.expenses.filter((_, i) => i !== idx);
          report.expensesTotal = report.expenses.reduce((sum, ex) => sum + ex.amount, 0);
        }
      }
    }
  }

  return removed;
}

function restoreTransaction(store: Store, entry: ActivityEntry) {
  const tx = entry.before;
  if (!tx) throw new Error("დასაბრუნებელი ჩანაწერი არ არის");
  if (store.transactions.some((t) => t.id === tx.id)) return;

  const copy = clone(tx);
  store.transactions = [copy, ...store.transactions];

  if (copy.type === "deposit") {
    const payment = entry.creditPayments?.[0];
    if (payment && !(store.creditPayments ?? []).some((p) => p.id === payment.id)) {
      if (!store.creditPayments) store.creditPayments = [];
      store.creditPayments.push(clone(payment));
    }
    if (entry.relatedSale) {
      const idx = store.transactions.findIndex((t) => t.id === entry.relatedSale!.id);
      if (idx >= 0) store.transactions[idx] = clone(entry.relatedSale);
    }
    return;
  }

  if (copy.type === "sale") {
    try {
      store.inventory = applySaleToStock(store.inventory, copy, -1);
    } catch {
      // მარაგი ვერ დაბრუნდა — ჩანაწერი მაინც ბრუნდება
    }
    const deliveries = entry.creditDeliveries ?? [];
    if (isCreditOrder(copy) && saleQuantityDelivered(copy) > 0) {
      if (deliveries.length === 0) {
        store.inventory = adjustStock(
          store.inventory,
          copy.branch,
          copy.productCode,
          -saleQuantityDelivered(copy)
        );
      } else {
        for (const d of deliveries) {
          store.inventory = adjustStock(
            store.inventory,
            d.fromBranch ?? copy.branch,
            copy.productCode,
            -d.quantity
          );
        }
      }
    }
    if (!store.creditPayments) store.creditPayments = [];
    if (!store.creditDeliveries) store.creditDeliveries = [];
    for (const p of entry.creditPayments ?? []) {
      if (!store.creditPayments.some((x) => x.id === p.id)) store.creditPayments.push(clone(p));
    }
    for (const d of deliveries) {
      if (!store.creditDeliveries.some((x) => x.id === d.id)) store.creditDeliveries.push(clone(d));
    }
    return;
  }

  if (copy.type === "expense") {
    applyExpenseToStore(store, copy);
  }
}

export function applyActivityUndo(store: Store, entry: ActivityEntry) {
  if (entry.undoneAt) throw new Error("უკვე გაუქმებულია");
  if (entry.kind === "delete") {
    restoreTransaction(store, entry);
  } else if (entry.kind === "create") {
    deleteStoredTransaction(store, entry.txId);
  } else if (entry.kind === "update" && entry.before) {
    const copy = clone(entry.before);
    const idx = store.transactions.findIndex((t) => t.id === copy.id);
    if (idx >= 0) store.transactions[idx] = copy;
    else store.transactions = [copy, ...store.transactions];
  } else {
    throw new Error("ამ მოქმედების გაუქმება ვერ ხერხდება");
  }
  entry.undoneAt = new Date().toISOString();
}

export function recordTransactionDiff(
  store: Store,
  beforeTx: Transaction[],
  beforeCredits: CreditPayment[],
  beforeDeliveries: CreditDelivery[]
) {
  const afterById = new Map(store.transactions.map((t) => [t.id, t]));
  const beforeById = new Map(beforeTx.map((t) => [t.id, t]));
  const afterCreditIds = new Set((store.creditPayments ?? []).map((p) => p.id));
  const afterDeliveryIds = new Set((store.creditDeliveries ?? []).map((d) => d.id));
  const afterCredits = store.creditPayments ?? [];

  const created: Transaction[] = [];
  const deleted: Transaction[] = [];
  const updated: { before: Transaction; after: Transaction }[] = [];

  for (const [id, prev] of beforeById) {
    const next = afterById.get(id);
    if (!next) deleted.push(prev);
    else if (JSON.stringify(prev) !== JSON.stringify(next)) updated.push({ before: prev, after: next });
  }
  for (const next of store.transactions) {
    if (!beforeById.has(next.id)) created.push(next);
  }

  const suppressedSaleIds = new Set<string>();
  for (const t of created) {
    if (t.type !== "deposit" || !t.linkedCreditPaymentId) continue;
    const payment = afterCredits.find((p) => p.id === t.linkedCreditPaymentId);
    if (payment) suppressedSaleIds.add(payment.saleId);
  }
  for (const t of deleted) {
    if (t.type !== "deposit" || !t.linkedCreditPaymentId) continue;
    const payment = beforeCredits.find((p) => p.id === t.linkedCreditPaymentId);
    if (payment) suppressedSaleIds.add(payment.saleId);
  }

  const at = new Date().toISOString();
  const entries: ActivityEntry[] = [];

  for (const t of created) {
    entries.push({
      id: uid(),
      at,
      kind: "create",
      title: actionTitle("create", t),
      detail: actionDetail(t),
      txId: t.id,
    });
  }

  for (const t of deleted) {
    const entry: ActivityEntry = {
      id: uid(),
      at,
      kind: "delete",
      title: actionTitle("delete", t),
      detail: actionDetail(t),
      txId: t.id,
      before: clone(t),
    };
    if (t.type === "sale") {
      const payments = beforeCredits.filter((p) => p.saleId === t.id && !afterCreditIds.has(p.id));
      const deliveries = beforeDeliveries.filter((d) => d.saleId === t.id && !afterDeliveryIds.has(d.id));
      if (payments.length) entry.creditPayments = payments.map((p) => clone(p));
      if (deliveries.length) entry.creditDeliveries = deliveries.map((d) => clone(d));
    }
    if (t.type === "deposit" && t.linkedCreditPaymentId) {
      const payment = beforeCredits.find((p) => p.id === t.linkedCreditPaymentId);
      if (payment) entry.creditPayments = [clone(payment)];
      const sale = payment ? beforeById.get(payment.saleId) : undefined;
      if (sale) entry.relatedSale = clone(sale);
    }
    entries.push(entry);
  }

  for (const row of updated) {
    if (row.before.type === "sale" && suppressedSaleIds.has(row.before.id)) continue;
    entries.push({
      id: uid(),
      at,
      kind: "update",
      title: actionTitle("update", row.after),
      detail: actionDetail(row.after),
      txId: row.before.id,
      before: clone(row.before),
    });
  }

  if (!entries.length) return;
  store.activityLog = trimActivityLog([...entries.reverse(), ...(store.activityLog ?? [])]);
}

/** წაშლის ჩანაწერი რჩება, რომ დაბრუნება არ დაიკარგოს. */
export function trimActivityLog(entries: ActivityEntry[]) {
  const kept: ActivityEntry[] = [];
  let other = 0;
  for (const entry of entries) {
    if (entry.kind === "delete" && entry.before) {
      kept.push(entry);
      continue;
    }
    if (other >= LOG_LIMIT) continue;
    other += 1;
    kept.push(entry);
  }
  return kept;
}

export function listActions(transactions: Transaction[], log: ActivityEntry[]): ActionView[] {
  const createdIds = new Set(log.filter((e) => e.kind === "create").map((e) => e.txId));
  const fromLog: ActionView[] = log.map((e) => ({
    key: e.id,
    at: e.at,
    kind: e.kind,
    title: e.undoneAt ? `${e.title} · ${e.kind === "delete" ? "დაბრუნებულია" : "გაუქმებულია"}` : e.title,
    detail: e.detail,
    undone: Boolean(e.undoneAt),
    canUndo: !e.undoneAt && (e.kind === "create" || (e.kind === "delete" && Boolean(e.before)) || (e.kind === "update" && Boolean(e.before))),
    entryId: e.id,
  }));

  const historical: ActionView[] = transactions
    .filter((t) => !createdIds.has(t.id))
    .map((t) => ({
      key: `tx:${t.id}`,
      at: t.date,
      kind: "create" as const,
      title: actionTitle("create", t),
      detail: actionDetail(t),
      undone: false,
      canUndo: true,
      txId: t.id,
    }));

  return [...fromLog, ...historical].sort((a, b) => b.at.localeCompare(a.at) || b.key.localeCompare(a.key));
}
