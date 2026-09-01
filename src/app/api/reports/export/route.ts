import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/require-admin";
import { buildPeriodReport, currentMonth } from "@/lib/utils";
import { readStore } from "@/lib/server-store";
import { buildReportWorkbook, reportExportFilename } from "@/lib/report-export";
import type { Branch } from "@/lib/types";

export const dynamic = "force-dynamic";

function resolveRange(
  mode: string,
  from: string | null,
  to: string | null
): { from: string; to: string } | null {
  const month = currentMonth();
  const today = new Date().toISOString().slice(0, 10);

  if (mode === "today") return { from: today, to: today };
  if (mode === "month") {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(y, m, 0).getDate();
    return {
      from: `${month}-01`,
      to: `${month}-${String(last).padStart(2, "0")}`,
    };
  }
  if (from && to) return { from, to };
  return null;
}

export async function GET(req: NextRequest) {
  const authError = await requireAdminSession();
  if (authError) return authError;

  const p = new URL(req.url).searchParams;
  const mode = p.get("mode") ?? "period";
  const fromParam = p.get("from");
  const toParam = p.get("to");
  const branch = (p.get("branch") ?? "ყველა") as Branch | "ყველა";

  const range = resolveRange(mode, fromParam, toParam);
  if (!range) {
    return NextResponse.json({ error: "from და to საჭიროა" }, { status: 400 });
  }

  const store = await readStore();
  const report = buildPeriodReport(
    store.transactions,
    store.obligations,
    range.from,
    range.to,
    branch,
    store.branchCash
  );
  const buf = buildReportWorkbook(report, store.branchReports);
  const filename = reportExportFilename(range.from, range.to, branch);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
