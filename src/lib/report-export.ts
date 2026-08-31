import * as XLSX from "xlsx";
import { BRANCHES } from "./constants";
import type { Branch, BranchDailyReport, PeriodReport, Transaction } from "./types";

function txDescription(t: Transaction): string {
  if (t.type === "sale") {
    const emp = t.employeeName ? ` (${t.employeeName})` : "";
    const buyer = t.buyerName ? ` / ${t.buyerName}` : "";
    return `${t.productName} × ${t.quantity}${emp}${buyer}`;
  }
  if (t.type === "deposit") return t.comment || t.kind;
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
    { პარამეტრი: "შემოსავალი (გაყიდვა)", მნიშვნელობა: report.revenue },
    { პარამეტრი: "დამფუძნებლის შენატანი", მნიშვნელობა: report.founderDeposits },
    { პარამეტრი: "სულ შენატანი", მნიშვნელობა: report.deposits },
    { პარამეტრი: "ხარჯები", მნიშვნელობა: report.expenses },
    { პარამეტრი: "ოპ. ნეტო (გაყიდვა − ხარჯი)", მნიშვნელობა: report.net },
    { პარამეტრი: "სალარო ნეტო (+ შენატანი)", მნიშვნელობა: report.cashFlowNet },
    { პარამეტრი: "ქეში პერიოდის ბოლოს", მნიშვნელობა: report.cashAtEnd },
    { პარამეტრი: "ბარათი პერიოდის ბოლოს", მნიშვნელობა: report.cardAtEnd },
    { პარამეტრი: "ანგარიში პერიოდის ბოლოს", მნიშვნელობა: report.bankAtEnd },
    { პარამეტრი: "ვალდ. ფარული", მნიშვნელობა: report.obligationPaid },
    { პარამეტრი: "ვალდ. დარჩენილი", მნიშვნელობა: report.obligationRemaining },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "შეჯამება");

  const branchRows: Record<string, string | number>[] = report.byBranch.map((b) => ({
    ფილიალი: b.branch,
    შემოსავალი: b.revenue,
    "დამფ. შენატანი": b.founderDeposits,
    "სულ შენატანი": b.deposits,
    ხარჯი: b.expenses,
    "ოპ. ნეტო": b.net,
    "სალარო ნეტო": b.cashFlowNet,
    "ქეში (დღის/პერიოდის ბოლოს)": b.cashAtEnd,
    ბარათი: b.cardAtEnd,
    "ანგარიშზე": b.bankAtEnd,
  }));
  const companyTotal = report.byBranch.reduce(
    (acc, b) => ({
      revenue: acc.revenue + b.revenue,
      expenses: acc.expenses + b.expenses,
      deposits: acc.deposits + b.deposits,
      founderDeposits: acc.founderDeposits + b.founderDeposits,
      cash: acc.cash + b.cashAtEnd,
      card: acc.card + b.cardAtEnd,
      bank: acc.bank + b.bankAtEnd,
    }),
    { revenue: 0, expenses: 0, deposits: 0, founderDeposits: 0, cash: 0, card: 0, bank: 0 }
  );
  branchRows.push({
    ფილიალი: "კომპანია (ჯამი)",
    შემოსავალი: companyTotal.revenue,
    "დამფ. შენატანი": companyTotal.founderDeposits,
    "სულ შენატანი": companyTotal.deposits,
    ხარჯი: companyTotal.expenses,
    "ოპ. ნეტო": companyTotal.revenue - companyTotal.expenses,
    "სალარო ნეტო": companyTotal.revenue - companyTotal.expenses + companyTotal.deposits,
    "ქეში (დღის/პერიოდის ბოლოს)": companyTotal.cash,
    ბარათი: companyTotal.card,
    "ანგარიშზე": companyTotal.bank,
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(branchRows), "ფილიალები");

  const plRows = [
    { კატეგორია: "ყოველთვიური შემოსავალი", თანხა: report.recurring.revenue },
    { კატეგორია: "ყოველთვიური ხარჯი", თანხა: report.recurring.expenses },
    { კატეგორია: "ყოველთვიური ნეტო", თანხა: report.recurring.net },
    { კატეგორია: "ერთჯერადი შემოსავალი", თანხა: report.oneTime.revenue },
    { კატეგორია: "ერთჯერადი ხარჯი", თანხა: report.oneTime.expenses },
    { კატეგორია: "ერთჯერადი ნეტო", თანხა: report.oneTime.net },
    { კატეგორია: "სულ შემოსავალი", თანხა: report.revenue },
    { კატეგორია: "სულ ხარჯი", თანხა: report.expenses },
    { კატეგორია: "სულ მოგება/ზარალი", თანხა: report.net },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(plRows), "მოგება-ზარალი");

  const dayRows = report.days.map((d) => {
    const row: Record<string, string | number> = {
      თარიღი: d.date,
      შემოსავალი: d.revenue,
      ხარჯი: d.expenses,
      ნეტო: d.net,
    };
    if (d.cashByBranch) {
      for (const br of BRANCHES) {
        row[`${br} ქეში`] = d.cashByBranch[br] ?? 0;
      }
    }
    return row;
  });
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(dayRows.length ? dayRows : [{ შეტყობინება: "მონაცემები არ არის" }]),
    "დღეები"
  );

  const txRows = report.transactions.map((t) => ({
    თარიღი: t.date.slice(0, 10),
    დრო: t.date,
    ფილიალი: t.branch,
    ტიპი:
      t.type === "sale"
        ? "შემოსავალი"
        : t.type === "deposit"
          ? "შენატანი"
          : "ხარჯი",
    აღწერა: txDescription(t),
    "გადახდის მეთოდი":
      t.type === "sale"
        ? t.paymentMethod
        : t.type === "deposit"
          ? (t.depositPaymentMethod ?? "ქეში (ნაღდი)")
          : (t.expensePaymentMethod ?? "ქეში (ნაღდი)"),
    "ყოველთვიური/ერთჯერადი": t.recurrence ?? "ერთჯერადი",
    თანხა: t.type === "expense" ? -t.amount : t.amount,
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
