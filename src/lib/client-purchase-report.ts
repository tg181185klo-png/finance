import type { Branch, Customer, CustomerPersonType, PaymentMethod, Sale, Transaction } from "./types";
import { saleGroupKey } from "./branch-payments";
import { customerDedupeKey, customerDisplayName, normalizeId, normalizePhone } from "./customers";
import { txInPeriod } from "./period-filter";
import { paymentMethodLabel, saleCreditPaid, txPaymentMethod } from "./utils";

export type ClientPersonKind = CustomerPersonType | "unknown";

export type ClientPurchaseProductLine = {
  id: string;
  productCode?: string;
  productName: string;
  quantity: number;
  amount: number;
  paid: number;
};

export type ClientPurchaseOrderRow = {
  /** შეკვეთის ჯგუფის გასაღები — ერთიანად შეყვანილი პროდუქტები */
  key: string;
  date: string;
  branch: Branch;
  name: string;
  personType: ClientPersonKind;
  personTypeLabel: string;
  identity: string;
  phone: string;
  enteredBy: string;
  productCount: number;
  quantityTotal: number;
  amount: number;
  paid: number;
  paymentMethod: PaymentMethod;
  paymentMethodLabel: string;
  products: ClientPurchaseProductLine[];
};

function personTypeLabel(t: ClientPersonKind) {
  if (t === "legal") return "კომპანია";
  if (t === "physical") return "ფიზიკური პირი";
  return "—";
}

export function salePaidAmount(sale: Sale): number {
  if (sale.paymentStatus === "ბე (ავანსი)") {
    return Math.min(sale.amount, saleCreditPaid(sale));
  }
  return sale.amount;
}

type ParsedIdentity = {
  name: string;
  phone: string;
  companyId: string;
  personalId: string;
  personType: ClientPersonKind;
};

function parseCommentMeta(comment?: string) {
  const parts = (comment || "").split(" · ").map((p) => p.trim());
  let companyId = "";
  let personalId = "";
  let phone = "";
  for (const p of parts) {
    const sk = p.match(/^ს\/კ:\s*(.+)$/i);
    if (sk) companyId = normalizeId(sk[1]);
    const pid = p.match(/^პირადი:\s*(.+)$/i);
    if (pid) personalId = normalizeId(pid[1]);
    const tel = p.match(/^ტელ:\s*(.+)$/i);
    if (tel) phone = normalizePhone(tel[1]);
  }
  return { companyId, personalId, phone };
}

export function parseSaleIdentity(sale: Sale): ParsedIdentity | null {
  const name = sale.buyerName?.trim();
  if (!name && !(sale.source === "distribucia" && sale.comment)) return null;

  const meta = parseCommentMeta(sale.comment);
  let displayName = name ?? "";
  if (!displayName && sale.comment) {
    displayName = sale.comment.split(" · ")[0]?.trim() || "";
  }
  if (!displayName) return null;

  let phone = meta.phone;
  if (!phone) {
    const parts = (sale.comment || "").split(" · ").map((p) => p.trim());
    const raw = parts.find(
      (p, i) => i > 0 && /[\d+]/.test(p) && !p.startsWith("ს/კ") && !p.startsWith("პირადი")
    );
    if (raw) phone = normalizePhone(raw);
  }

  let personType: ClientPersonKind = "unknown";
  if (meta.companyId.length >= 7) personType = "legal";
  else if (meta.personalId.length >= 9) personType = "physical";
  else if (phone.length >= 9) personType = "physical";

  return {
    name: displayName,
    phone,
    companyId: meta.companyId,
    personalId: meta.personalId,
    personType,
  };
}

function matchCustomer(id: ParsedIdentity, customers: Customer[]): Customer | null {
  const keyCandidates = [
    id.companyId.length >= 7 ? `legal:${id.companyId}` : null,
    id.personalId.length >= 9 ? `physical:pid:${id.personalId}` : null,
    id.phone.length >= 9 ? `physical:phone:${id.phone}` : null,
  ].filter(Boolean) as string[];

  for (const c of customers) {
    const ck = customerDedupeKey(c);
    if (ck && keyCandidates.includes(ck)) return c;
    if (id.companyId && c.personType === "legal" && normalizeId(c.companyId ?? "") === id.companyId) return c;
    if (id.personalId && c.personType === "physical" && normalizeId(c.personalId ?? "") === id.personalId) {
      return c;
    }
    if (
      id.phone &&
      c.personType === "physical" &&
      (normalizePhone(c.phone ?? "") === id.phone || normalizePhone(c.contactPhone ?? "") === id.phone)
    ) {
      return c;
    }
  }
  return null;
}

/**
 * ერთიანად შეყვანილი შეკვეთა = ერთი ხაზი (clientSaleId / distribuciaOrderId).
 * პროდუქტები products[]-შია — UI-ში დაჭერისას იშლება.
 */
export function buildClientPurchaseOrderRows(
  transactions: Transaction[],
  customers: Customer[],
  from: string,
  to: string,
  options?: {
    branch?: Branch | "ყველა";
    personType?: ClientPersonKind | "all";
    search?: string;
  }
): ClientPurchaseOrderRow[] {
  const branch = options?.branch ?? "ყველა";
  const typeFilter = options?.personType ?? "all";
  const search = (options?.search ?? "").trim().toLowerCase();

  const groups = new Map<string, Sale[]>();

  for (const t of transactions) {
    if (t.type !== "sale") continue;
    if (!txInPeriod(t.date, from, to)) continue;
    if (branch !== "ყველა" && t.branch !== branch) continue;
    if (!parseSaleIdentity(t)) continue;

    const key = saleGroupKey(t);
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const rows: ClientPurchaseOrderRow[] = [];

  for (const [key, sales] of groups) {
    sales.sort((a, b) => a.productName.localeCompare(b.productName, "ka"));
    const first = sales[0];
    const identity = parseSaleIdentity(first)!;
    const matched = matchCustomer(identity, customers);
    const personType: ClientPersonKind = matched?.personType ?? identity.personType;
    if (typeFilter !== "all" && personType !== typeFilter) continue;

    const name = matched ? customerDisplayName(matched) : identity.name;
    const phone = matched?.phone || matched?.contactPhone || identity.phone || "";
    const identityCode =
      personType === "legal"
        ? matched?.companyId || identity.companyId || ""
        : matched?.personalId || identity.personalId || "";

    const method = txPaymentMethod(first);
    const enteredBy = first.employeeName?.trim() || "—";
    const date = sales.reduce((max, s) => (s.date > max ? s.date : max), first.date);
    const products: ClientPurchaseProductLine[] = sales.map((s) => ({
      id: s.id,
      productCode: s.productCode,
      productName: s.productName,
      quantity: s.quantity,
      amount: s.amount,
      paid: salePaidAmount(s),
    }));

    const amount = products.reduce((s, p) => s + p.amount, 0);
    const paid = products.reduce((s, p) => s + p.paid, 0);
    const quantityTotal = products.reduce((s, p) => s + p.quantity, 0);

    const row: ClientPurchaseOrderRow = {
      key,
      date,
      branch: first.branch,
      name,
      personType,
      personTypeLabel: personTypeLabel(personType),
      identity: identityCode,
      phone,
      enteredBy,
      productCount: products.length,
      quantityTotal,
      amount,
      paid,
      paymentMethod: method,
      paymentMethodLabel: paymentMethodLabel(method),
      products,
    };

    if (search) {
      const hay = [
        row.name,
        row.phone,
        row.identity,
        row.personTypeLabel,
        row.enteredBy,
        row.paymentMethodLabel,
        row.branch,
        ...row.products.map((p) => `${p.productName} ${p.productCode ?? ""}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(search)) continue;
    }

    rows.push(row);
  }

  return rows.sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return b.key.localeCompare(a.key);
  });
}
