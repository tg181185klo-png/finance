import { BRANCHES } from "./constants";
import type {
  Branch,
  BranchCash,
  BranchInventory,
  Expense,
  ExpenseBranch,
  Obligation,
  ObligationPayment,
  RecurringObligation,
  Sale,
  Store,
  Transaction,
} from "./types";

export function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleString("ka-GE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMoney(n: number) {
  return `${n.toLocaleString("ka-GE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₾`;
}

function matchBranch(branch: Branch | ExpenseBranch, filter: Branch | "ყველა") {
  if (filter === "ყველა") return true;
  return branch === filter || branch === "საერთო";
}

export function emptyBranchCash(): BranchCash {
  return { cash: 0, card: 0, bank: 0 };
}

export function emptyInventory(): Record<Branch, BranchInventory> {
  return { ქუთაისი: {}, ლილო: {}, დიღომი: {} };
}

export function getStock(inventory: Record<Branch, BranchInventory>, branch: Branch, productCode: string) {
  return inventory[branch]?.[productCode] ?? 0;
}

export function saleAffectsStock(sale: Pick<Sale, "productCode">) {
  return Boolean(sale.productCode && sale.productCode !== "—");
}

export function adjustStock(
  inventory: Record<Branch, BranchInventory>,
  branch: Branch,
  productCode: string,
  delta: number
) {
  if (!productCode || productCode === "—" || !delta) return inventory;
  const next = { ...inventory, [branch]: { ...inventory[branch] } };
  const cur = next[branch][productCode] ?? 0;
  next[branch][productCode] = cur + delta;
  return next;
}

export function applySaleToStock(
  inventory: Record<Branch, BranchInventory>,
  sale: Sale,
  direction: 1 | -1
) {
  if (!saleAffectsStock(sale)) return inventory;
  return adjustStock(inventory, sale.branch, sale.productCode, direction * sale.quantity);
}

export function calcBalances(
  tx: Transaction[],
  branch: Branch | "ყველა",
  branchCash?: Record<Branch, BranchCash>
) {
  const b = { total: 0, cash: 0, card: 0, bank: 0, credit: 0, revenue: 0, expenses: 0 };

  if (branchCash) {
    const branches = branch === "ყველა" ? BRANCHES : [branch];
    for (const br of branches) {
      const o = branchCash[br] ?? emptyBranchCash();
      b.cash += o.cash;
      b.card += o.card;
      b.bank += o.bank;
    }
  }

  for (const t of tx) {
    if (!matchBranch(t.branch, branch)) continue;
    if (t.type === "sale") {
      b.revenue += t.amount;
      if (t.paymentStatus === "ბე (ავანსი)") b.credit += t.amount;
      else if (t.paymentMethod === "ქეში (ნაღდი)") b.cash += t.amount;
      else if (t.paymentMethod === "ბარათი") b.card += t.amount;
      else b.bank += t.amount;
    } else {
      b.expenses += t.amount;
      if (t.expensePaymentMethod === "ბარათი") b.card -= t.amount;
      else b.cash -= t.amount;
    }
  }

  b.total = b.revenue - b.expenses;
  return b;
}

function obligationBranchMatch(ob: Obligation, branch: ExpenseBranch) {
  return ob.branch === "ყველა" || ob.branch === branch || branch === "საერთო";
}

export function ensureMonthObligations(store: Store, month: string) {
  const recurring = store.recurringObligations ?? [];
  if (!recurring.length) return false;
  if (!store.obligations[month]) store.obligations[month] = [];
  let changed = false;
  for (const rec of recurring) {
    const exists = store.obligations[month].some((o) => o.recurringId === rec.id);
    if (!exists) {
      store.obligations[month].push({
        id: uid(),
        name: rec.name,
        amount: rec.amount,
        paid: 0,
        branch: rec.branch,
        category: rec.category,
        month,
        recurringId: rec.id,
      });
      changed = true;
    }
  }
  return changed;
}

export function paymentsForObligation(store: Store, obligationId: string) {
  return (store.obligationPayments ?? [])
    .filter((p) => p.obligationId === obligationId)
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

export function applyExpenseToObligations(
  obligations: Record<string, Obligation[]>,
  expense: Expense,
  payments?: ObligationPayment[]
): Record<string, Obligation[]> {
  const month = expense.date.slice(0, 7);
  const list = obligations[month];
  if (!list?.length) return obligations;

  let remaining = expense.amount;
  const next = { ...obligations, [month]: list.map((o) => ({ ...o })) };
  const items = next[month];

  for (const ob of items) {
    if (remaining <= 0) break;
    const left = ob.amount - ob.paid;
    if (left <= 0) continue;
    if (!obligationBranchMatch(ob, expense.branch)) continue;

    const catMatch = ob.category === expense.category;
    const nameMatch =
      expense.comment.toLowerCase().includes(ob.name.toLowerCase()) ||
      ob.name.toLowerCase().includes(expense.comment.toLowerCase());

    if (!catMatch && !nameMatch) continue;

    const pay = Math.min(remaining, left);
    ob.paid += pay;
    remaining -= pay;
    expense.obligationId = ob.id;

    if (payments) {
      payments.push({
        id: uid(),
        obligationId: ob.id,
        expenseId: expense.id,
        amount: pay,
        paidAt: expense.date,
        note: expense.comment,
      });
    }
  }

  return next;
}

export function applyExpenseToStore(store: Store, expense: Expense) {
  const month = expense.date.slice(0, 7);
  ensureMonthObligations(store, month);
  if (!store.obligationPayments) store.obligationPayments = [];
  store.obligations = applyExpenseToObligations(
    store.obligations,
    expense,
    store.obligationPayments
  );
}

export function reverseExpenseObligation(store: Store, expense: Expense) {
  if (!store.obligationPayments) store.obligationPayments = [];
  const related = store.obligationPayments.filter((p) => p.expenseId === expense.id);
  if (related.length) {
    for (const p of related) {
      const month = expense.date.slice(0, 7);
      const list = store.obligations[month];
      const ob = list?.find((o) => o.id === p.obligationId);
      if (ob) ob.paid = Math.max(0, ob.paid - p.amount);
    }
    store.obligationPayments = store.obligationPayments.filter((p) => p.expenseId !== expense.id);
    return;
  }
  if (expense.obligationId) {
    const month = expense.date.slice(0, 7);
    const list = store.obligations[month];
    const ob = list?.find((o) => o.id === expense.obligationId);
    if (ob) ob.paid = Math.max(0, ob.paid - expense.amount);
  }
}

export function addRecurringObligation(
  store: Store,
  data: Omit<RecurringObligation, "id" | "createdAt">,
  month: string
) {
  if (!store.recurringObligations) store.recurringObligations = [];
  const rec: RecurringObligation = {
    ...data,
    id: uid(),
    createdAt: new Date().toISOString(),
  };
  store.recurringObligations.push(rec);
  if (!store.obligations[month]) store.obligations[month] = [];
  store.obligations[month].push({
    id: uid(),
    name: rec.name,
    amount: rec.amount,
    paid: 0,
    branch: rec.branch,
    category: rec.category,
    month,
    recurringId: rec.id,
  });
  return rec;
}

export function obligationSummary(obligations: Record<string, Obligation[]>, month: string, branch: Branch | "ყველა") {
  const list = obligations[month] ?? [];
  const filtered = list.filter((o) => branch === "ყველა" || o.branch === "ყველა" || o.branch === branch);
  const total = filtered.reduce((s, o) => s + o.amount, 0);
  const paid = filtered.reduce((s, o) => s + o.paid, 0);
  return { total, paid, remaining: total - paid, items: filtered };
}

export function buildPeriodReport(
  tx: Transaction[],
  obligations: Record<string, Obligation[]>,
  from: string,
  to: string,
  branch: Branch | "ყველა"
) {
  const filtered = tx.filter((t) => {
    const d = t.date.slice(0, 10);
    if (d < from || d > to) return false;
    return matchBranch(t.branch, branch);
  });

  let revenue = 0;
  let expenses = 0;
  const dayMap = new Map<string, { revenue: number; expenses: number }>();

  for (const t of filtered) {
    const d = t.date.slice(0, 10);
    const row = dayMap.get(d) ?? { revenue: 0, expenses: 0 };
    if (t.type === "sale") {
      revenue += t.amount;
      row.revenue += t.amount;
    } else {
      expenses += t.amount;
      row.expenses += t.amount;
    }
    dayMap.set(d, row);
  }

  const days = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, revenue: v.revenue, expenses: v.expenses, net: v.revenue - v.expenses }));

  const months = new Set<string>();
  for (let d = new Date(from); d <= new Date(to); d.setDate(d.getDate() + 1)) {
    months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }

  let obligationTotal = 0;
  let obligationPaid = 0;
  for (const m of months) {
    const s = obligationSummary(obligations, m, branch);
    obligationTotal += s.total;
    obligationPaid += s.paid;
  }

  return {
    from,
    to,
    branch,
    revenue,
    expenses,
    net: revenue - expenses,
    days,
    obligationTotal,
    obligationPaid,
    obligationRemaining: obligationTotal - obligationPaid,
  };
}

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthStartEnd(month = currentMonth()) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

// Client migration from old localStorage
const LEGACY_KEY = "fin-dashboard-tx";

export function loadLegacyTransactions(): Transaction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    return raw ? (JSON.parse(raw) as Transaction[]) : [];
  } catch {
    return [];
  }
}

export function clearLegacyTransactions() {
  localStorage.removeItem(LEGACY_KEY);
}
