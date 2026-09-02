import { NextRequest, NextResponse } from "next/server";
import { filterOperationalTransactions } from "@/lib/period-filter";
import { OPERATIONAL_DATA_FROM } from "@/lib/report-config";
import { overviewByToken, readStore } from "@/lib/server-store";
import type { BranchDailyReport } from "@/lib/types";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token საჭიროა" }, { status: 400 });
  }

  const store = await readStore();
  if (!overviewByToken(store, token)) {
    return NextResponse.json({ error: "არასწორი ლინკი" }, { status: 403 });
  }

  const transactions = filterOperationalTransactions(store.transactions);
  const branchReports = (store.branchReports ?? []).filter(
    (r: BranchDailyReport) => r.date >= OPERATIONAL_DATA_FROM
  );

  return NextResponse.json({
    transactions,
    branchCash: store.branchCash,
    branchReports,
    operationalFrom: OPERATIONAL_DATA_FROM,
  });
}
