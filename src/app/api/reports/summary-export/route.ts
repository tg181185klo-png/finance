import { NextRequest, NextResponse } from "next/server";
import {
  buildFinancialSummaryWorkbook,
  financialSummaryFromReport,
  summaryExportFilename,
} from "@/lib/financial-summary-export";
import { buildPeriodReport, lastMonths, monthStartEnd } from "@/lib/utils";
import { readStore } from "@/lib/server-store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const mode = p.get("mode") ?? "period";
  const store = await readStore();

  let rows;

  if (mode === "months") {
    const count = Math.min(24, Math.max(1, parseInt(p.get("count") ?? "6", 10)));
    rows = lastMonths(count).map((m) => {
      const { from, to } = monthStartEnd(m);
      const report = buildPeriodReport(
        store.transactions,
        store.obligations,
        from,
        to,
        "ყველა",
        store.branchCash
      );
      return financialSummaryFromReport(report, m);
    });
  } else {
    const from = p.get("from");
    const to = p.get("to");
    if (!from || !to) {
      return NextResponse.json({ error: "from და to საჭიროა" }, { status: 400 });
    }
    const report = buildPeriodReport(
      store.transactions,
      store.obligations,
      from,
      to,
      "ყველა",
      store.branchCash
    );
    rows = [financialSummaryFromReport(report)];
  }

  const buffer = buildFinancialSummaryWorkbook(rows);
  const filename = summaryExportFilename(rows[0]?.from ?? "start", rows[rows.length - 1]?.to ?? "end");

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
