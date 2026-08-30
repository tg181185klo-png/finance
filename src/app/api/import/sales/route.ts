import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN, BRANCHES } from "@/lib/constants";
import {
  buildImportSales,
  isBranchMonthImport,
  mergeRowsByProduct,
  parseDistributionExcel,
  salesToImportRows,
  summarizeImportRows,
} from "@/lib/excel-import";
import { updateStore } from "@/lib/server-store";
import type { Branch, Sale, Store } from "@/lib/types";
import { reverseCreditOrderData } from "@/lib/utils";

export const dynamic = "force-dynamic";

function removeBranchMonthImports(store: Store, branch: Branch, month: string) {
  const removed = store.transactions.filter(
    (t): t is Sale => t.type === "sale" && isBranchMonthImport(t, branch, month)
  );
  for (const t of removed) {
    reverseCreditOrderData(store, t.id, t);
  }
  store.transactions = store.transactions.filter((t) => !removed.some((r) => r.id === t.id));
  return removed.length;
}

function parseFiles(form: FormData): File[] {
  const list = form.getAll("files").filter((f): f is File => f instanceof File);
  const single = form.get("file");
  if (single instanceof File) list.push(single);
  return list;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const files = parseFiles(form);
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
    if (!files.length) {
      return NextResponse.json({ error: "Excel ფაილი საჭიროა" }, { status: 400 });
    }
    if (!previewOnly && pin !== ADMIN_PIN) {
      return NextResponse.json({ error: "არასწორი კოდი" }, { status: 403 });
    }

    let parsedRows: ReturnType<typeof parseDistributionExcel> = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      parsedRows = mergeRowsByProduct([...parsedRows, ...parseDistributionExcel(buffer)]);
    }

    const fileNames = files.map((f) => f.name);
    const summary = summarizeImportRows(parsedRows);

    if (previewOnly) {
      return NextResponse.json({
        ok: true,
        preview: true,
        ...summary,
        products: parsedRows.length,
        sample: parsedRows.slice(0, 8),
        month,
        branch,
        fileNames,
        mergeMode: !replaceExisting,
      });
    }

    let imported = 0;
    let removed = 0;
    let mergedProductCount = parsedRows.length;
    let mergedTotal = summary.total;

    const store = await updateStore((s) => {
      let mergedRows = parsedRows;
      if (!replaceExisting) {
        const existing = s.transactions.filter(
          (t): t is Sale => t.type === "sale" && isBranchMonthImport(t, branch, month)
        );
        mergedRows = mergeRowsByProduct([...salesToImportRows(existing), ...parsedRows]);
      }
      mergedProductCount = mergedRows.length;
      mergedTotal = summarizeImportRows(mergedRows).total;
      removed = removeBranchMonthImports(s, branch, month);
      const label =
        fileNames.length === 1 ? fileNames[0] : `${fileNames.length} ფაილი · შეჯამება`;
      const sales = buildImportSales(mergedRows, {
        branch,
        month,
        fileLabel: label,
        employeeName: employeeName || undefined,
      });
      imported = sales.length;
      s.transactions = [...sales, ...s.transactions];
    });

    return NextResponse.json({
      ok: true,
      imported,
      products: mergedProductCount,
      replaced: removed,
      total: mergedTotal,
      month,
      branch,
      fileNames,
      mergeMode: !replaceExisting,
      transactions: store.transactions,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "იმპორტი ვერ მოხერხდა";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
