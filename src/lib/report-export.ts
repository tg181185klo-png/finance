import * as XLSX from "xlsx";
import type { Branch, BranchDailyReport, PeriodReport, Transaction } from "./types";

function txDescription(t: Transaction): string {
  if (t.type === "sale") {
    const emp = t.employeeName ? ` (${t.employeeName})` : "";
    const buyer = t.buyerName ? ` / ${t.buyerName}` : "";
    return `${t.productName} × ${t.quantity}${emp}${buyer}`;
  }
  return t.comment ? `${t.category} — ${t.comment}` : t.category;
}

function filterBranchReports(
  reports: BranchDailyReport[],
  from: string,
  to: string,
  branch: Branch | "ყველა"
) {
  return reports.filter((r) => {
    if (r.date < from || r.date > to) return false;
    if (branch !== "ყველა" && r.branch !== branch) return false;
    return true;
  });
}

export function buildReportWorkbook(
  report: PeriodReport,
  branchReports: BranchDailyReport[]
): Buffer {
  const wb = XLSX.utils.book_new();
  const filteredReports = filterBranchReports(branchReports, report.from, report.to, report.branch);

  const summaryRows = [
    { პარამეტრი: "პერიოდი", მნიშვნელობა: `${report.from} — ${report.to}` },
    { პარამეტრი: "ფილიალი", მნიშვნელობა: report.branch },
    { პარამეტრი: "შემოსავალი", მნიშვნელობა: report.revenue },
    { პარამეტრი: "ხარჯები", მნიშვნელობა: report.expenses },
    { პარამეტრი: "ნეტო", მნიშვნელობა: report.net },
    { პარამეტრი: "ვალდ. ფარული", მნიშვნელობა: report.obligationPaid },
    { პარამეტრი: "ვალდ. დარჩენილი", მნიშვნელობა: report.obligationRemaining },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "შეჯამება");

  const dayRows = report.days.map((d) => ({
    თარიღი: d.date,
    შემოსავალი: d.revenue,
    ხარჯი: d.expenses,
    ნეტო: d.net,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(dayRows.length ? dayRows : [{ შეტყობინება: "მონაცემები არ არის" }]),
    "დღეები"
  );

  const txRows = report.transactions.map((t) => ({
    თარიღი: t.date.slice(0, 10),
    დრო: t.date,
    ფილიალი: t.branch,
    ტიპი: t.type === "sale" ? "შემოსავალი" : "ხარჯი",
    აღწერა: txDescription(t),
    "გადახდის მეთოდი":
      t.type === "sale" ? t.paymentMethod : (t.expensePaymentMethod ?? "ქეში (ნაღდი)"),
    თანხა: t.type === "sale" ? t.amount : -t.amount,
    წყარო: t.source === "branch" ? "ფილიალი" : "ადმინი",
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(txRows.length ? txRows : [{ შეტყობინება: "ტრანზაქციები არ არის" }]),
    "ტრანზაქციები"
  );

  const clientRows: Record<string, string | number>[] = filteredReports.flatMap((r) => {
    if (r.clientSales?.length) {
      return r.clientSales.flatMap((c) =>
        c.products.map((p) => ({
          თარიღი: r.date,
          ფილიალი: r.branch,
          "ვინ გაგზავნა": r.submittedBy ?? "",
          კლიენტი: `${c.customerFirstName} ${c.customerLastName}`.trim(),
          "პ/ნ": c.personalId ?? "",
          ტელეფონი: c.phone,
          "პროდუქტის კოდი": p.productCode,
          პროდუქტი: p.productName,
          რაოდენობა: p.quantity,
          "გასაყიდი ფასი": p.unitPrice,
          ჯამი: p.amount,
          "გადახდის მეთოდი": p.paymentMethod ?? c.paymentMethod,
        }))
      );
    }
    return [
      {
        თარიღი: r.date,
        ფილიალი: r.branch,
        "ვინ გაგზავნა": r.submittedBy ?? "",
        კლიენტი: r.salesNote || "—",
        "პ/ნ": "",
        ტელეფონი: "",
        "პროდუქტის კოდი": "",
        პროდუქტი: r.salesTotal > 0 ? `შემოსავალი: ${r.salesTotal}` : "ნულოვანი რეპორტი",
        რაოდენობა: 0,
        "გასაყიდი ფასი": 0,
        ჯამი: r.salesTotal,
        "გადახდის მეთოდი": "",
      },
    ];
  });
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(clientRows.length ? clientRows : [{ შეტყობინება: "ფილიალის რეპორტები არ არის" }]),
    "ფილიალის რეპორტი"
  );

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function reportExportFilename(from: string, to: string, branch: string) {
  const range = from === to ? from : `${from}_${to}`;
  const safeBranch = branch.replace(/\s+/g, "-");
  return `რეპორტი_${safeBranch}_${range}.xlsx`;
}
