import type { BranchClientSale, BranchDailyReport } from "./types";

/** ლინკის სამუშაო დღე + გაგზავნის რეალური საათი (ლოკალური). */
export function branchTransactionDate(reportDay: string, submittedAt: string): string {
  const at = new Date(submittedAt);
  const [y, m, d] = reportDay.split("-").map(Number);
  const merged = new Date(at);
  merged.setFullYear(y, m - 1, d);
  return merged.toISOString();
}

export function formatReportDay(day: string) {
  const [y, m, d] = day.split("-");
  return `${d}.${m}.${y}`;
}

function clientSaleFingerprint(c: BranchClientSale): string {
  const prods = c.products
    .map((p) => `${p.productCode}|${p.quantity}|${p.amount}|${p.paymentMethod ?? ""}`)
    .sort()
    .join(";");
  const person =
    c.personType === "legal"
      ? `legal|${c.companyId?.trim()}|${c.companyName?.trim()}`
      : `phys|${c.phone?.trim()}|${c.customerFirstName?.trim()}|${c.customerLastName?.trim()}`;
  return `${person}|${prods}|${c.comment?.trim() ?? ""}`;
}

export function hasDuplicateClientSales(report: BranchDailyReport): boolean {
  const seen = new Set<string>();
  for (const sale of report.clientSales ?? []) {
    const key = clientSaleFingerprint(sale);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export function reportSubmissionWarnings(report: BranchDailyReport): string[] {
  const warnings: string[] = [];
  const history =
    report.submissionHistory?.length
      ? report.submissionHistory
      : report.submittedAt
        ? [
            {
              submittedAt: report.submittedAt,
              submittedEmployeeId: report.submittedEmployeeId ?? "",
              submittedBy: report.submittedBy ?? "—",
            },
          ]
        : [];
  if (history.length > 1) {
    warnings.push(`${history.length} გაგზავნა`);
  }
  const byEmployee = new Map<string, number>();
  for (const h of history) {
    byEmployee.set(h.submittedEmployeeId, (byEmployee.get(h.submittedEmployeeId) ?? 0) + 1);
  }
  if ([...byEmployee.values()].some((n) => n > 1)) {
    warnings.push("იგივე თანამშრომელი რამდენჯერმე გაგზავნა");
  }
  if (hasDuplicateClientSales(report)) {
    warnings.push("იდენტური გაყიდვა ორჯერ");
  }
  return warnings;
}

export function isReportSuspicious(report: BranchDailyReport): boolean {
  return reportSubmissionWarnings(report).length > 0;
}
