import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN, BRANCHES } from "@/lib/constants";
import { buildImportSales, parseDistributionExcel, summarizeImportRows } from "@/lib/excel-import";
import { updateStore } from "@/lib/server-store";
import type { Branch, Sale, Store } from "@/lib/types";
import { importCommentPrefix, reverseCreditOrderData } from "@/lib/utils";

export const dynamic = "force-dynamic";

function removeImportSales(store: Store, branch: Branch, month: string) {
  const prefix = `Excel · ${month} ·`;
  const removed = store.transactions.filter(
    (t) => t.type === "sale" && t.branch === branch && t.source === "import" && t.comment.startsWith(prefix)
  );
  for (const t of removed) {
    if (t.type === "sale") reverseCreditOrderData(store, t.id, t);
  }
  store.transactions = store.transactions.filter((t) => !removed.some((r) => r.id === t.id));
  return removed.length;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const pin = String(form.get("pin") ?? "");
    const branch = String(form.get("branch") ?? "დისტრიბუცია") as Branch;
    const month = String(form.get("month") ?? "");
    const employeeName = String(form.get("employeeName") ?? "").trim();
    const replaceExisting = form.get("replaceExisting") === "true";
    const previewOnly = form.get("preview") === "true";

    if (!BRANCHES.includes(branch)) {
      return NextResponse.json({ error: "არასწორი ფილიალი" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: "თვე: YYYY-MM ფორმატი" }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Excel ფაილი საჭიროა" }, { status: 400 });
    }
    if (!previewOnly && pin !== ADMIN_PIN) {
      return NextResponse.json({ error: "არასწორი კოდი" }, { status: 403 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = parseDistributionExcel(buffer);
    const summary = summarizeImportRows(rows);

    if (previewOnly) {
      return NextResponse.json({
        ok: true,
        preview: true,
        ...summary,
        sample: rows.slice(0, 5),
        month,
        branch,
        fileName: file.name,
      });
    }

    const sales: Sale[] = buildImportSales(rows, {
      branch,
      month,
      fileName: file.name,
      employeeName: employeeName || undefined,
    });

    let replaced = 0;
    const store = await updateStore((s) => {
      if (replaceExisting) {
        replaced = removeImportSales(s, branch, month);
      }
      s.transactions = [...sales, ...s.transactions];
    });

    return NextResponse.json({
      ok: true,
      imported: sales.length,
      replaced,
      total: summary.total,
      month,
      branch,
      fileName: file.name,
      commentTag: importCommentPrefix(month, file.name),
      transactions: store.transactions,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "იმპორტი ვერ მოხერხდა";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
