import type { Branch, PaymentMethod, Sale } from "./types";
import { isDistribuciaSale } from "./distribucia-sync";

export const CASH_OR_BANK: PaymentMethod[] = ["ქეში (ნაღდი)", "ანგარიშზე ჩარიცხვა"];

export function paymentBucket(m: PaymentMethod): "cash" | "bank" | "card" {
  if (m === "ქეში (ნაღდი)") return "cash";
  if (m === "ბარათი") return "card";
  return "bank";
}

export function paymentShort(m: PaymentMethod) {
  if (m === "ქეში (ნაღდი)") return "ქეში";
  if (m === "ანგარიშზე ჩარიცხვა") return "გადმორიცხვა";
  if (m === "ბარათი") return "ბარათი";
  return m;
}

export function saleGroupKey(sale: Sale): string {
  if (sale.distribuciaOrderId) return `dist-order:${sale.distribuciaOrderId}`;
  if (sale.clientSaleId) return `client:${sale.clientSaleId}`;
  if (sale.reportId && sale.buyerName) return `report:${sale.reportId}|${sale.buyerName}`;
  return `tx:${sale.id}`;
}

export function saleGroupLabel(sale: Sale): string {
  if (sale.buyerName) return sale.buyerName;
  if (sale.productName === "დღის შემოსავალი") return "დღის შემოსავალი";
  return sale.productName || sale.comment || "—";
}

export function branchSalesForPayments(
  sales: Sale[],
  branch: Branch,
  from: string,
  to: string
): Sale[] {
  return sales.filter((sale) => {
    if (sale.branch !== branch) return false;
    const date = sale.date.slice(0, 10);
    if (date < from || date > to) return false;
    return true;
  });
}

export function branchesSalesForPayments(
  sales: Sale[],
  branches: Branch[],
  from: string,
  to: string
): Sale[] {
  const set = new Set(branches);
  return sales.filter((sale) => {
    if (!set.has(sale.branch)) return false;
    const date = sale.date.slice(0, 10);
    if (date < from || date > to) return false;
    return true;
  });
}

export function isDistribuciaBranch(branch: Branch) {
  return branch === "დისტრიბუცია";
}

export function branchPaymentOptions(branch: Branch): PaymentMethod[] {
  return isDistribuciaBranch(branch) ? CASH_OR_BANK : ["ქეში (ნაღდი)", "ბარათი", "ანგარიშზე ჩარიცხვა"];
}

export type SalePaymentGroup = {
  groupId: string;
  date: string;
  branch: Branch;
  label: string;
  lines: Sale[];
  total: number;
  paymentMethod: PaymentMethod;
  isDistribucia: boolean;
  distribuciaOrderId?: string;
  clientSaleId?: string;
  lineIds: string[];
};

export function groupBranchSales(sales: Sale[]): SalePaymentGroup[] {
  const map = new Map<string, SalePaymentGroup>();

  for (const sale of sales) {
    const date = sale.date.slice(0, 10);
    const groupId = saleGroupKey(sale);
    const cur = map.get(groupId) ?? {
      groupId,
      date,
      branch: sale.branch,
      label: saleGroupLabel(sale),
      lines: [],
      total: 0,
      paymentMethod: sale.paymentMethod,
      isDistribucia: isDistribuciaSale(sale),
      distribuciaOrderId: sale.distribuciaOrderId,
      clientSaleId: sale.clientSaleId,
      lineIds: [],
    };
    cur.lines.push(sale);
    cur.lineIds.push(sale.id);
    cur.total += sale.amount;
    if (date < cur.date) cur.date = date;
    map.set(groupId, cur);
  }

  return [...map.values()].sort((a, b) => b.date.localeCompare(a.date) || b.total - a.total);
}

/** ნულოვანი რეპორტი — გაყიდვა არ ყოფილა */
export function isZeroTradeReport(report: {
  salesTotal: number;
  clientSales?: { products: { amount?: number }[] }[];
  sales?: { amount?: number }[];
}): boolean {
  if ((report.clientSales ?? []).length > 0) return false;
  if ((report.sales ?? []).some((s) => (s.amount ?? 0) > 0)) return false;
  return (report.salesTotal ?? 0) <= 0;
}
