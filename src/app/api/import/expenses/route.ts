import { NextRequest, NextResponse } from "next/server";
import { ADMIN_PIN, BRANCHES } from "@/lib/constants";
import {
  buildImportExpenses,
  detectDefaultBranchFromFileName,
  isFileMonthExpenseImport,
  parseExpenseExcel,
  slugFromFileName,
  summarizeExpenseImport,
  type ParsedExpenseRow,
} from "@/lib/excel-expense-import";
import { updateStore } from "@/lib/server-store";
import type { Branch, Expense, Store } from "@/lib/types";
import { applyExpenseToStore, reverseExpenseObligation } from "@/lib/utils";

export const dynamic = "force-dynamic";

function parseFiles(form: FormData): File[] {
  const list = form.getAll("files").filter((f): f is File => f instanceof File);
  const single = form.get("file");
  if (single instanceof File) list.push(single);
  return list;
}

function removeFileMonthImports(store: Store, month: string, slugs: string[]) {
  const removed = store.transactions.filter(
    (t): t is Expense =>
      t.type === "expense" && slugs.some((slug) => isFileMonthExpenseImport(t, month, slug))
  );
  for (const t of removed) {
    reverseExpenseObligation(store, t);
  }
  store.transactions = store.transactions.filter((t) => !removed.some((r) => r.id === t.id));
  return removed.length;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const files = parseFiles(form);
    const pin = String(form.get("pin") ?? "");
    const branch = String(form.get("branch") ?? "") as Branch;
    const month = String(form.get("month") ?? "");
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

    const batches: { fileName: string; slug: string; rows: ParsedExpenseRow[] }[] = [];
    let skipped = 0;
    let outOfMonth = 0;

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const defaultBranch = detectDefaultBranchFromFileName(file.name) ?? branch;
      const result = parseExpenseExcel(buffer, {
        defaultBranch,
        month,
        fileName: file.name,
      });
      batches.push({
        fileName: file.name,
        slug: slugFromFileName(file.name),
        rows: result.rows,
      });
      skipped += result.skipped;
      outOfMonth += result.outOfMonth;
    }

    const parsedAll = batches.flatMap((b) => b.rows);
    const summary = summarizeExpenseImport(parsedAll);
    const fileNames = batches.map((b) => b.fileName);
    const fileSlugs = batches.map((b) => b.slug);

    if (previewOnly) {
      return NextResponse.json({
        ok: true,
        preview: true,
        ...summary,
        sample: parsedAll.slice(0, 10),
        month,
        branch,
        fileNames,
        skipped,
        outOfMonth,
        replaceMode: replaceExisting,
      });
    }

    let imported = 0;
    let removed = 0;

    const store = await updateStore((s) => {
      if (replaceExisting) {
        removed = removeFileMonthImports(s, month, fileSlugs);
      }

      const expenses: Expense[] = [];
      for (const batch of batches) {
        const batchExpenses = buildImportExpenses(batch.rows, {
          month,
          fileLabel: batch.fileName,
          fileSlug: batch.slug,
        });
        for (const exp of batchExpenses) {
          if (!replaceExisting && s.transactions.some((t) => t.id === exp.id)) continue;
          applyExpenseToStore(s, exp);
          expenses.push(exp);
        }
      }
      imported = expenses.length;
      s.transactions = [...expenses, ...s.transactions];
    });

    return NextResponse.json({
      ok: true,
      imported,
      replaced: removed,
      total: summary.total,
      byBranch: summary.byBranch,
      month,
      branch,
      fileNames,
      skipped,
      outOfMonth,
      transactions: store.transactions,
      obligations: store.obligations,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "იმპორტი ვერ მოხერხდა";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
