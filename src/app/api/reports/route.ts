import { NextRequest, NextResponse } from "next/server";
import { buildPeriodReport, currentMonth } from "@/lib/utils";
import { readStore } from "@/lib/server-store";
import type { Branch } from "@/lib/types";

export async function GET(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const from = p.get("from");
  const to = p.get("to");
  const branch = (p.get("branch") ?? "ყველა") as Branch | "ყველა";
  const mode = p.get("mode") ?? "period";

  const store = await readStore();
  const month = currentMonth();
  const today = new Date().toISOString().slice(0, 10);

  if (mode === "today") {
    const report = buildPeriodReport(store.transactions, store.obligations, today, today, branch);
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
      branch
    );
    return NextResponse.json(report);
  }

  if (!from || !to) {
    return NextResponse.json({ error: "from და to საჭიროა" }, { status: 400 });
  }

  const report = buildPeriodReport(store.transactions, store.obligations, from, to, branch);
  return NextResponse.json(report);
}
