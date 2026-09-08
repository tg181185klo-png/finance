import type { Branch, PaymentMethod, Transaction, TxSource } from "./types";
import { saleGroupKey, saleGroupLabel } from "./branch-payments";
import { saleGroupDescription } from "./tx-display-groups";
import { isCreditOrder, isCreditOrderActive, txPaymentMethod } from "./utils";

export const CARD_METHOD: PaymentMethod = "ბარათი";
export const BANK_METHOD: PaymentMethod = "ანგარიშზე ჩარიცხვა";

export type LedgerChannel = "bank" | "card";
export type LedgerDirection = "in" | "out";

export type AccountLedgerRow = {
  /** React key / ჯგუფის იდენტიფიკატორი */
  id: string;
  /** ყველა ტრანზაქციის id ამ გადახდაში (შედარება/ნანახი) */
  ids: string[];
  date: string;
  branch: Branch | "საერთო";
  direction: LedgerDirection;
  channel: LedgerChannel;
  label: string;
  comment: string;
  depositorName: string;
  amount: number;
  source: TxSource | "admin";
  paymentMethod: PaymentMethod;
  /** რამდენი პროდუქტის ხაზი გაერთიანდა ერთ გადახდაში */
  productCount: number;
};

function channel(method: PaymentMethod): LedgerChannel | null {
  if (method === CARD_METHOD) return "card";
  if (method === BANK_METHOD) return "bank";
  return null;
}

function sourceLabel(source?: TxSource): string {
  if (source === "branch") return "დღიური რეპორტი";
  if (source === "import") return "იმპორტი";
  if (source === "distribucia") return "დისტრიბუცია";
  return "ადმინი";
}

function expenseLedgerText(t: Extract<Transaction, { type: "expense" }>): { label: string; comment: string } {
  const src = sourceLabel(t.source);
  const isObligation = Boolean(t.obligationId);
  const kind = isObligation ? "ვალდებულების გასტუმრება" : "ხარჯი";
  const label = `${src} · ${kind} · ${t.category}`;
  const payNote =
    t.expensePaymentMethod === BANK_METHOD
      ? "ანგარიშიდან ჩამოჭრა"
      : "ბარათიდან ჩამოჭრა";
  const comment = t.comment?.trim() ? `${t.comment} (${payNote})` : payNote;
  return { label, comment };
}

function depositLedgerText(t: Extract<Transaction, { type: "deposit" }>): { label: string; comment: string } {
  const kind =
    t.kind === "founder"
      ? "დამფუძნებლის შენატანი"
      : t.kind === "loan_repayment"
        ? "ვალის დაბრუნება"
        : "შენატანი";
  const method = t.depositPaymentMethod ?? BANK_METHOD;
  const payNote = method === BANK_METHOD ? "ანგარიშზე ჩარიცხვა" : "ბარათზე ჩარიცხვა";
  return {
    label: `${kind}`,
    comment: t.comment?.trim() ? `${t.comment} (${payNote})` : payNote,
  };
}

function depositorName(t: Transaction): string {
  if (t.type === "sale") {
    return t.buyerName?.trim() || t.employeeName?.trim() || "—";
  }
  if (t.type === "deposit") {
    if (t.comment?.trim()) return t.comment.trim();
    if (t.kind === "founder") return "დამფუძნებელი";
    if (t.kind === "loan_repayment") return "ვალის დაბრუნება";
    return "შენატანი";
  }
  if (t.type === "expense") {
    return t.comment?.trim() || t.category || "—";
  }
  return "";
}

function salePaymentRow(
  groupKey: string,
  sales: Extract<Transaction, { type: "sale" }>[]
): AccountLedgerRow | null {
  const primary = [...sales].sort((a, b) => b.date.localeCompare(a.date))[0];
  const method = txPaymentMethod(primary);
  const ch = channel(method);
  if (!ch) return null;

  const src = sourceLabel(primary.source);
  const buyer = primary.buyerName ? ` · ${primary.buyerName}` : "";
  const emp = primary.employeeName ? ` · ${primary.employeeName}` : "";
  const payNote = method === BANK_METHOD ? "ანგარიშზე ჩარიცხვა" : "ბარათით გადახდა";
  const desc = saleGroupDescription(sales);
  const countNote = sales.length > 1 ? ` · ${sales.length} პროდუქტი` : "";

  return {
    id: groupKey,
    ids: sales.map((s) => s.id),
    date: primary.date.slice(0, 10),
    branch: primary.branch,
    direction: "in",
    channel: ch,
    label: `${src} · გადახდა${buyer}${emp}${countNote}`,
    comment: `${desc} — ${payNote}`,
    depositorName: saleGroupLabel(primary) || depositorName(primary),
    amount: sales.reduce((s, x) => s + x.amount, 0),
    source: primary.source ?? "admin",
    paymentMethod: method,
    productCount: sales.length,
  };
}

/** ერთი სტრიქონი = ერთი ფულადი გადახდა (არა ცალკე პროდუქტი) */
export function buildAccountLedgerRows(
  transactions: Transaction[],
  opts: {
    from: string;
    to: string;
    branch?: Branch | "ყველა";
    channelFilter?: "all" | LedgerChannel;
    operationalFrom?: string;
  }
): AccountLedgerRow[] {
  const { from, to, branch = "ყველა", channelFilter = "all", operationalFrom } = opts;
  const salesByPay = new Map<string, Extract<Transaction, { type: "sale" }>[]>();
  const out: AccountLedgerRow[] = [];

  for (const t of transactions) {
    const date = t.date.slice(0, 10);
    if (operationalFrom && date < operationalFrom) continue;
    if (date < from || date > to) continue;
    if (branch !== "ყველა" && t.branch !== branch) continue;

    const method = txPaymentMethod(t);
    const ch = channel(method);
    if (!ch) continue;
    if (channelFilter !== "all" && channelFilter !== ch) continue;

    if (t.type === "sale") {
      if (isCreditOrder(t) && isCreditOrderActive(t)) continue;
      const key = saleGroupKey(t);
      const list = salesByPay.get(key) ?? [];
      list.push(t);
      salesByPay.set(key, list);
      continue;
    }

    if (t.type === "deposit") {
      const { label, comment } = depositLedgerText(t);
      out.push({
        id: t.id,
        ids: [t.id],
        date,
        branch: t.branch,
        direction: "in",
        channel: ch,
        label,
        comment,
        depositorName: depositorName(t),
        amount: t.amount,
        source: t.source ?? "admin",
        paymentMethod: method,
        productCount: 1,
      });
      continue;
    }

    if (t.type === "expense") {
      const { label, comment } = expenseLedgerText(t);
      out.push({
        id: t.id,
        ids: [t.id],
        date,
        branch: t.branch,
        direction: "out",
        channel: ch,
        label,
        comment,
        depositorName: depositorName(t),
        amount: t.amount,
        source: t.source ?? "admin",
        paymentMethod: method,
        productCount: 1,
      });
    }
  }

  for (const [key, sales] of salesByPay) {
    const row = salePaymentRow(key, sales);
    if (row) out.push(row);
  }

  return out.sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export function ledgerTotals(rows: AccountLedgerRow[]) {
  let incoming = 0;
  let outgoing = 0;
  let incomingBank = 0;
  let incomingCard = 0;
  let outgoingBank = 0;
  let outgoingCard = 0;
  for (const r of rows) {
    if (r.direction === "in") {
      incoming += r.amount;
      if (r.channel === "bank") incomingBank += r.amount;
      else incomingCard += r.amount;
    } else {
      outgoing += r.amount;
      if (r.channel === "bank") outgoingBank += r.amount;
      else outgoingCard += r.amount;
    }
  }
  return { incoming, outgoing, net: incoming - outgoing, incomingBank, incomingCard, outgoingBank, outgoingCard };
}

export function nonCashOpening(
  branchCash: Record<Branch, import("./types").BranchCash> | undefined,
  branch: Branch | "ყველა",
  branches: Branch[]
) {
  const list = branch === "ყველა" ? branches : [branch];
  let card = 0;
  let bank = 0;
  for (const b of list) {
    const o = branchCash?.[b];
    card += o?.card ?? 0;
    bank += o?.bank ?? 0;
  }
  return { card, bank, total: card + bank };
}

export function ledgerRowReviewed(
  row: AccountLedgerRow,
  bankLedgerReviewed: Record<string, string>
): boolean {
  return row.ids.length > 0 && row.ids.every((id) => Boolean(bankLedgerReviewed[id]));
}

export function ledgerRowHint<T>(row: AccountLedgerRow, hints: Record<string, T>): T | undefined {
  for (const id of row.ids) {
    if (hints[id]) return hints[id];
  }
  return undefined;
}
