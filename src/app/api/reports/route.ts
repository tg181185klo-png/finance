import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/require-admin";
import { buildPeriodReport, currentMonth, lastMonths, monthStartEnd } from "@/lib/utils";
import { readStore } from "@/lib/server-store";
import { REPORT_HISTORY_MAX_MONTHS, REPORT_HISTORY_MONTHS } from "@/lib/report-config";
import type { Branch } from "@/lib/types";

export async function GET(req: NextRequest) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const p = new URL(req.url).searchParams;
  const from = p.get("from");
  const to = p.get("to");
  const branch = (p.get("branch") ?? "ყველა") as Branch | "ყველა";
  const mode = p.get("mode") ?? "period";

  const store = await readStore();
  const month = currentMonth();
  const today = new Date().toISOString().slice(0, 10);

  if (mode === "today") {
    const report = buildPeriodReport(store.transactions, store.obligations, today, today, branch, store.branchCash);
    return NextResponse.json(report);
  }

  if (mode === "month") {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    const report = buildPeriodReport(
      store.transactions,
      store.obligations,
      `${month}-01`,
      `${month}-${String(last).padStart(2, "0")}`,
      branch,
      store.branchCash
    );
    return NextResponse.json(report);
  }

  if (mode === "months") {
    const count = Math.min(
      REPORT_HISTORY_MAX_MONTHS,
      Math.max(1, parseInt(p.get("count") ?? String(REPORT_HISTORY_MONTHS), 10))
    );
    const months = lastMonths(count);
    const items = months.map((m) => {
      const { from, to } = monthStartEnd(m);
      const company = buildPeriodReport(
        store.transactions,
        store.obligations,
        from,
        to,
        "ყველა",
        store.branchCash
      );
      return {
        month: m,
        revenue: company.revenue,
        expenses: company.expenses,
        deposits: company.deposits,
        founderDeposits: company.founderDeposits,
        net: company.net,
        cashFlowNet: company.cashFlowNet,
        byBranch: company.byBranch.map((b) => ({
          branch: b.branch,
          revenue: b.revenue,
          expenses: b.expenses,
          deposits: b.deposits,
          founderDeposits: b.founderDeposits,
          net: b.net,
          cashFlowNet: b.cashFlowNet,
        })),
      };
    });
    return NextResponse.json({ months: items });
  }

  if (mode === "monthly") {
    const monthParam = p.get("month") ?? month;
    const { from, to } = monthStartEnd(monthParam);
    const report = buildPeriodReport(
      store.transactions,
      store.obligations,
      from,
      to,
      branch,
      store.branchCash
    );
    return NextResponse.json(report);
  }

  if (!from || !to) {
    return NextResponse.json({ error: "from და to საჭიროა" }, { status: 400 });
  }

  const report = buildPeriodReport(store.transactions, store.obligations, from, to, branch, store.branchCash);
  return NextResponse.json(report);
}
