import type { Branch, Customer, CustomerPersonType, Sale, Transaction } from "./types";
import { customerDedupeKey, customerDisplayName, normalizeId, normalizePhone } from "./customers";
import { txInPeriod } from "./period-filter";
import { isCreditOrder, saleCreditPaid } from "./utils";

export type ClientPersonKind = CustomerPersonType | "unknown";

export type ClientPurchaseProduct = {
  productCode?: string;
  productName: string;
  quantity: number;
  amount: number;
};

export type ClientPurchaseLine = {
  id: string;
  date: string;
  branch: Branch;
  productCode?: string;
  productName: string;
  quantity: number;
  amount: number;
  paid: number;
  remaining: number;
  paymentLabel: string;
};

export type ClientPurchaseRow = {
  key: string;
  name: string;
  personType: ClientPersonKind;
  personTypeLabel: string;
  identity: string;
  phone: string;
  branches: string;
  orders: number;
  lines: number;
  orderedTotal: number;
  paidTotal: number;
  remainingTotal: number;
  lastDate: string;
  products: ClientPurchaseProduct[];
  detailLines: ClientPurchaseLine[];
};

function personTypeLabel(t: ClientPersonKind) {
  if (t === "legal") return "კომპანია";
  if (t === "physical") return "ფიზიკური პირი";
  return "—";
}

function paymentLabel(sale: Sale) {
  if (sale.paymentStatus === "ბე (ავანსი)" || isCreditOrder(sale)) {
    const paid = saleCreditPaid(sale);
    if (paid <= 0) return "ბე (გადაუხდელი)";
    if (paid >= sale.amount) return "ბე (დაფარული)";
    return "ბე (ნაწილობრივი)";
  }
  return "სრულად გადახდილი";
}

export function salePaidAmount(sale: Sale): number {
  if (sale.paymentStatus === "ბე (ავანსი)" || isCreditOrder(sale)) {
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
    const raw = parts.find((p, i) => i > 0 && /[\d+]/.test(p) && !p.startsWith("ს/კ") && !p.startsWith("პირადი"));
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

function clientKeyFromIdentity(id: ParsedIdentity): string {
  if (id.companyId.length >= 7) return `legal:${id.companyId}`;
  if (id.personalId.length >= 9) return `physical:pid:${id.personalId}`;
  if (id.phone.length >= 9) return `physical:phone:${id.phone}`;
  return `name:${id.name.toLowerCase()}`;
}

function matchCustomer(id: ParsedIdentity, customers: Customer[]): Customer | null {
  const key = clientKeyFromIdentity(id);
  for (const c of customers) {
    const ck = customerDedupeKey(c);
    if (ck && ck === key) return c;
    if (id.companyId && c.personType === "legal" && normalizeId(c.companyId ?? "") === id.companyId) return c;
    if (id.personalId && c.personType === "physical" && normalizeId(c.personalId ?? "") === id.personalId) return c;
    if (
      id.phone &&
      c.personType === "physical" &&
      (normalizePhone(c.phone ?? "") === id.phone || normalizePhone(c.contactPhone ?? "") === id.phone)
    ) {
      return c;
    }
    if (customerDisplayName(c).toLowerCase() === id.name.toLowerCase()) return c;
  }
  return null;
}

function orderGroupKey(sale: Sale) {
  return sale.clientSaleId || sale.distribuciaOrderId || sale.id;
}

export function buildClientPurchaseReport(
  transactions: Transaction[],
  customers: Customer[],
  from: string,
  to: string,
  options?: {
    branch?: Branch | "ყველა";
    personType?: ClientPersonKind | "all";
    search?: string;
  }
): ClientPurchaseRow[] {
  const branch = options?.branch ?? "ყველა";
  const typeFilter = options?.personType ?? "all";
  const search = (options?.search ?? "").trim().toLowerCase();

  const sales = transactions.filter((t): t is Sale => {
    if (t.type !== "sale") return false;
    if (!txInPeriod(t.date, from, to)) return false;
    if (branch !== "ყველა" && t.branch !== branch) return false;
    return Boolean(parseSaleIdentity(t));
  });

  const byClient = new Map<string, ClientPurchaseRow>();

  for (const sale of sales) {
    const identity = parseSaleIdentity(sale)!;
    const matched = matchCustomer(identity, customers);
    const personType: ClientPersonKind = matched?.personType ?? identity.personType;
    const name = matched ? customerDisplayName(matched) : identity.name;
    const phone =
      matched?.phone ||
      matched?.contactPhone ||
      identity.phone ||
      "";
    const identityCode =
      personType === "legal"
        ? matched?.companyId || identity.companyId || ""
        : matched?.personalId || identity.personalId || "";

    const key =
      (matched && customerDedupeKey(matched)) ||
      clientKeyFromIdentity({ ...identity, personType, name, phone });

    if (typeFilter !== "all" && personType !== typeFilter) continue;

    const paid = salePaidAmount(sale);
    const remaining = Math.max(0, sale.amount - paid);
    const detail: ClientPurchaseLine = {
      id: sale.id,
      date: sale.date,
      branch: sale.branch,
      productCode: sale.productCode,
      productName: sale.productName,
      quantity: sale.quantity,
      amount: sale.amount,
      paid,
      remaining,
      paymentLabel: paymentLabel(sale),
    };

    let row = byClient.get(key);
    if (!row) {
      row = {
        key,
        name,
        personType,
        personTypeLabel: personTypeLabel(personType),
        identity: identityCode,
        phone,
        branches: sale.branch,
        orders: 0,
        lines: 0,
        orderedTotal: 0,
        paidTotal: 0,
        remainingTotal: 0,
        lastDate: sale.date,
        products: [],
        detailLines: [],
      };
      byClient.set(key, row);
    }

    row.lines += 1;
    row.orderedTotal += sale.amount;
    row.paidTotal += paid;
    row.remainingTotal += remaining;
    if (sale.date > row.lastDate) row.lastDate = sale.date;
    if (!row.branches.split(", ").includes(sale.branch)) {
      row.branches = [...row.branches.split(", "), sale.branch].filter(Boolean).join(", ");
    }
    row.detailLines.push(detail);

    const productKey = `${sale.productCode ?? ""}|${sale.productName}`;
    const existingProduct = row.products.find(
      (p) => `${p.productCode ?? ""}|${p.productName}` === productKey
    );
    if (existingProduct) {
      existingProduct.quantity += sale.quantity;
      existingProduct.amount += sale.amount;
    } else {
      row.products.push({
        productCode: sale.productCode,
        productName: sale.productName,
        quantity: sale.quantity,
        amount: sale.amount,
      });
    }
  }

  // Count distinct orders per client
  const ordersByClient = new Map<string, Set<string>>();
  for (const sale of sales) {
    const identity = parseSaleIdentity(sale)!;
    const matched = matchCustomer(identity, customers);
    const key =
      (matched && customerDedupeKey(matched)) ||
      clientKeyFromIdentity({
        ...identity,
        personType: matched?.personType ?? identity.personType,
        name: matched ? customerDisplayName(matched) : identity.name,
      });
    if (!byClient.has(key)) continue;
    const set = ordersByClient.get(key) ?? new Set();
    set.add(orderGroupKey(sale));
    ordersByClient.set(key, set);
  }
  for (const [key, set] of ordersByClient) {
    const row = byClient.get(key);
    if (row) row.orders = set.size;
  }

  let rows = [...byClient.values()];
  if (search) {
    rows = rows.filter((r) => {
      const hay = [r.name, r.phone, r.identity, r.personTypeLabel, ...r.products.map((p) => p.productName)]
        .join(" ")
        .toLowerCase();
      return hay.includes(search);
    });
  }

  for (const row of rows) {
    row.products.sort((a, b) => b.amount - a.amount);
    row.detailLines.sort((a, b) => b.date.localeCompare(a.date));
  }

  return rows.sort((a, b) => b.orderedTotal - a.orderedTotal);
}
