import type { Branch, BranchClientSale, BranchDailyReport, Customer } from "./types";
import { branchSaleBuyerName, customerDedupeKey, customerDisplayName, normalizeId, normalizePhone } from "./customers";

export const BONUS_RATE_NEW = 0.01;
export const BONUS_RATE_LEGACY = 0.005;

export type BonusSaleLine = {
  reportId: string;
  clientSaleId: string;
  date: string;
  branch: Branch;
  employeeName: string;
  clientName: string;
  clientKey: string;
  isLegacy: boolean;
  clientStatus: "ახალი" | "ძველი";
  amount: number;
  bonusRate: number;
  bonusAmount: number;
  productsSummary: string;
};

export type EmployeeBonusRow = {
  employeeName: string;
  salesCount: number;
  newCount: number;
  oldCount: number;
  totalAmount: number;
  newAmount: number;
  oldAmount: number;
  totalBonus: number;
};

export type ClientTradingRow = {
  clientKey: string;
  clientName: string;
  isLegacy: boolean;
  clientStatus: "ახალი" | "ძველი";
  employeeName: string;
  saleDays: number;
  salesCount: number;
  totalAmount: number;
  totalBonus: number;
};

function saleClientKey(sale: BranchClientSale): string {
  if (sale.personType === "legal") {
    const id = normalizeId(sale.companyId ?? "");
    if (id.length >= 7) return `legal:${id}`;
    const name = (sale.companyName ?? "").trim().toLowerCase();
    if (name) return `legal:name:${name}`;
  }
  const pid = normalizeId(sale.personalId ?? "");
  if (pid.length >= 9) return `physical:pid:${pid}`;
  const phone = normalizePhone(sale.phone ?? sale.contactPhone ?? "");
  if (phone.length >= 9) return `physical:phone:${phone}`;
  const name = `${sale.customerFirstName ?? ""} ${sale.customerLastName ?? ""}`.trim().toLowerCase();
  return `physical:name:${name || branchSaleBuyerName(sale).toLowerCase()}`;
}

function findCustomerForSale(sale: BranchClientSale, customers: Customer[]): Customer | null {
  const key = saleClientKey(sale);
  for (const c of customers) {
    const ck =
      customerDedupeKey(c) ??
      (c.personType === "legal"
        ? `legal:name:${(c.companyName ?? "").trim().toLowerCase()}`
        : `physical:name:${customerDisplayName(c).toLowerCase()}`);
    if (ck === key) return c;
    if (sale.personType === "legal" && c.personType === "legal") {
      const saleId = normalizeId(sale.companyId ?? "");
      const cid = normalizeId(c.companyId ?? "");
      if (saleId && cid && saleId === cid) return c;
      if (
        (sale.companyName ?? "").trim().toLowerCase() === (c.companyName ?? "").trim().toLowerCase() &&
        (sale.companyName ?? "").trim()
      ) {
        return c;
      }
    }
  }
  return null;
}

function isLegacyClient(sale: BranchClientSale, customers: Customer[]): boolean {
  const found = findCustomerForSale(sale, customers);
  if (found) return found.isLegacy;
  return false;
}

function bonusRate(isLegacy: boolean) {
  return isLegacy ? BONUS_RATE_LEGACY : BONUS_RATE_NEW;
}

export function buildBonusSaleLines(
  branchReports: BranchDailyReport[],
  customers: Customer[],
  from: string,
  to: string,
  branchFilter?: Branch | "ყველა"
): BonusSaleLine[] {
  const lines: BonusSaleLine[] = [];

  for (const report of branchReports) {
    if (report.date < from || report.date > to) continue;
    if (branchFilter && branchFilter !== "ყველა" && report.branch !== branchFilter) continue;

    for (let i = 0; i < (report.clientSales ?? []).length; i++) {
      const sale = report.clientSales![i];
      const clientSaleId = sale.clientSaleId ?? `${report.id}-sale-${i}`;
      const amount = sale.products.reduce((s, p) => s + (p.amount || 0), 0);
      if (amount <= 0) continue;

      const legacy = isLegacyClient(sale, customers);
      const rate = bonusRate(legacy);
      const employeeName = sale.driverEmployeeName?.trim() || report.submittedBy?.trim() || "—";
      const productsSummary = sale.products
        .map((p) => `${p.productName} ×${p.quantity}`)
        .join(", ");

      lines.push({
        reportId: report.id,
        clientSaleId,
        date: report.date,
        branch: report.branch,
        employeeName,
        clientName: branchSaleBuyerName(sale),
        clientKey: saleClientKey(sale),
        isLegacy: legacy,
        clientStatus: legacy ? "ძველი" : "ახალი",
        amount,
        bonusRate: rate,
        bonusAmount: amount * rate,
        productsSummary,
      });
    }
  }

  return lines.sort((a, b) => b.date.localeCompare(a.date) || b.amount - a.amount);
}

export function buildEmployeeBonusSummary(lines: BonusSaleLine[]): EmployeeBonusRow[] {
  const map = new Map<string, EmployeeBonusRow>();

  for (const line of lines) {
    const row = map.get(line.employeeName) ?? {
      employeeName: line.employeeName,
      salesCount: 0,
      newCount: 0,
      oldCount: 0,
      totalAmount: 0,
      newAmount: 0,
      oldAmount: 0,
      totalBonus: 0,
    };
    row.salesCount += 1;
    row.totalAmount += line.amount;
    row.totalBonus += line.bonusAmount;
    if (line.isLegacy) {
      row.oldCount += 1;
      row.oldAmount += line.amount;
    } else {
      row.newCount += 1;
      row.newAmount += line.amount;
    }
    map.set(line.employeeName, row);
  }

  return [...map.values()].sort((a, b) => b.totalBonus - a.totalBonus);
}

export function buildClientTradingSummary(lines: BonusSaleLine[]): ClientTradingRow[] {
  const map = new Map<string, ClientTradingRow & { days: Set<string> }>();

  for (const line of lines) {
    const key = `${line.clientKey}|${line.employeeName}`;
    const row = map.get(key) ?? {
      clientKey: line.clientKey,
      clientName: line.clientName,
      isLegacy: line.isLegacy,
      clientStatus: line.clientStatus,
      employeeName: line.employeeName,
      saleDays: 0,
      salesCount: 0,
      totalAmount: 0,
      totalBonus: 0,
      days: new Set<string>(),
    };
    row.salesCount += 1;
    row.totalAmount += line.amount;
    row.totalBonus += line.bonusAmount;
    row.days.add(line.date);
    map.set(key, row);
  }

  return [...map.values()]
    .map(({ days, ...row }) => ({ ...row, saleDays: days.size }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

export function bonusTotals(lines: BonusSaleLine[]) {
  return {
    sales: lines.length,
    revenue: lines.reduce((s, l) => s + l.amount, 0),
    bonus: lines.reduce((s, l) => s + l.bonusAmount, 0),
    newSales: lines.filter((l) => !l.isLegacy).length,
    oldSales: lines.filter((l) => l.isLegacy).length,
  };
}
