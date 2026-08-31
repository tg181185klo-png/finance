import * as XLSX from "xlsx";
import type { BranchPeriodStats, FinancialSummaryRow } from "./types";
import { BRANCHES } from "./constants";

export function buildFinancialSummaryWorkbook(rows: FinancialSummaryRow[]): Buffer {
  const wb = XLSX.utils.book_new();

  const companyRows = rows.map((r) => ({
    თვე: r.month ?? `${r.from} — ${r.to}`,
    შემოსავალი: r.revenue,
    "დამფუძნებლის შენატანი": r.founderDeposits,
    "სხვა შენატანი": r.otherDeposits,
    "სულ შენატანი": r.deposits,
    ხარჯი: r.expenses,
    "ოპ. ნეტო (გაყიდვა − ხარჯი)": r.net,
    "სალარო ნეტო (+ შენატანი)": r.cashFlowNet,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(companyRows), "კომპანია");

  const branchRows: Record<string, string | number>[] = [];
  for (const r of rows) {
    const label = r.month ?? `${r.from} — ${r.to}`;
    for (const b of r.byBranch) {
      branchRows.push(branchRow(label, b));
    }
    branchRows.push(branchRow(`${label} · ჯამი`, sumBranches(r.byBranch), true));
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(branchRows.length ? branchRows : [{ შეტყობინება: "მონაცემები არ არის" }]),
    "ფილიალები"
  );

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function branchRow(
  period: string,
  b: Pick<
    BranchPeriodStats,
    "branch" | "revenue" | "expenses" | "deposits" | "founderDeposits" | "net" | "cashFlowNet"
  >,
  isTotal = false
): Record<string, string | number> {
  return {
    პერიოდი: period,
    ფილიალი: isTotal ? "კომპანია" : b.branch,
    შემოსავალი: b.revenue,
    "დამფუძნებლის შენატანი": b.founderDeposits,
    "სხვა შენატანი": b.deposits - b.founderDeposits,
    "სულ შენატანი": b.deposits,
    ხარჯი: b.expenses,
    "ოპ. ნეტო": b.net,
    "სალარო ნეტო": b.cashFlowNet,
  };
}

function sumBranches(byBranch: BranchPeriodStats[]): BranchPeriodStats {
  const base: BranchPeriodStats = {
    branch: "ქუთაისი",
    revenue: 0,
    expenses: 0,
    deposits: 0,
    founderDeposits: 0,
    net: 0,
    cashFlowNet: 0,
    cashAtEnd: 0,
    cardAtEnd: 0,
    bankAtEnd: 0,
  };
  for (const b of byBranch) {
    base.revenue += b.revenue;
    base.expenses += b.expenses;
    base.deposits += b.deposits;
    base.founderDeposits += b.founderDeposits;
    base.net += b.net;
    base.cashFlowNet += b.cashFlowNet;
  }
  return base;
}

export function financialSummaryFromReport(
  report: {
    from: string;
    to: string;
    revenue: number;
    expenses: number;
    deposits: number;
    founderDeposits: number;
    net: number;
    cashFlowNet: number;
    byBranch: BranchPeriodStats[];
  },
  month?: string
): FinancialSummaryRow {
  return {
    month,
    from: report.from,
    to: report.to,
    revenue: report.revenue,
    founderDeposits: report.founderDeposits,
    otherDeposits: report.deposits - report.founderDeposits,
    deposits: report.deposits,
    expenses: report.expenses,
    net: report.net,
    cashFlowNet: report.cashFlowNet,
    byBranch: report.byBranch,
  };
}

export function summaryExportFilename(from: string, to: string) {
  const range = from === to ? from : `${from}_${to}`;
  return `ფინანსური_ანგარიში_${range}.xlsx`;
}

export { BRANCHES };
