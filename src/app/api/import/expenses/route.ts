import { NextRequest, NextResponse } from "next/server";
import { BRANCHES } from "@/lib/constants";
import { requireAdminSession } from "@/lib/require-admin";
import {
  buildImportDeposits,
  buildImportExpenses,
  detectDefaultBranchFromFileName,
  isFileMonthDepositImport,
  isFileMonthExpenseImport,
  parseExpenseExcel,
  slugFromFileName,
  summarizeDepositImport,
  summarizeExpenseImport,
  type ParsedDepositRow,
  type ParsedExpenseRow,
} from "@/lib/excel-expense-import";
import { updateStore } from "@/lib/server-store";
import type { Branch, Deposit, Expense, Store } from "@/lib/types";
import { applyExpenseToStore, reverseExpenseObligation } from "@/lib/utils";

export const dynamic = "force-dynamic";

function parseFiles(form: FormData): File[] {
  const list = form.getAll("files").filter((f): f is File => f instanceof File);
  const single = form.get("file");
  if (single instanceof File) list.push(single);
  return list;
}

function removeFileMonthImports(store: Store, month: string, slugs: string[]) {
  const removedExp = store.transactions.filter(
    (t): t is Expense =>
      t.type === "expense" && slugs.some((slug) => isFileMonthExpenseImport(t, month, slug))
  );
  for (const t of removedExp) {
    reverseExpenseObligation(store, t);
  }
  const removedDep = store.transactions.filter(
    (t): t is Deposit =>
      t.type === "deposit" && slugs.some((slug) => isFileMonthDepositImport(t, month, slug))
  );
  const removedIds = new Set([...removedExp, ...removedDep].map((t) => t.id));
  store.transactions = store.transactions.filter((t) => !removedIds.has(t.id));
  return removedExp.length + removedDep.length;
}

export async function POST(req: NextRequest) {
  try {
    const authError = await requireAdminSession();
    if (authError) return authError;

    const form = await req.formData();
    const files = parseFiles(form);
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

    const batches: {
      fileName: string;
      slug: string;
      rows: ParsedExpenseRow[];
      deposits: ParsedDepositRow[];
    }[] = [];
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
        deposits: result.deposits,
      });
      skipped += result.skipped;
      outOfMonth += result.outOfMonth;
    }

    const parsedAll = batches.flatMap((b) => b.rows);
    const depositsAll = batches.flatMap((b) => b.deposits);
    const summary = summarizeExpenseImport(parsedAll);
    const depositSummary = summarizeDepositImport(depositsAll);
    const fileNames = batches.map((b) => b.fileName);
    const fileSlugs = batches.map((b) => b.slug);

    if (previewOnly) {
      return NextResponse.json({
        ok: true,
        preview: true,
        ...summary,
        deposits: depositSummary.lines,
        depositTotal: depositSummary.total,
        founderDeposits: depositSummary.founder,
        depositByBranch: depositSummary.byBranch,
        sample: parsedAll.slice(0, 8),
        depositSample: depositsAll.slice(0, 8),
        month,
        branch,
        fileNames,
        skipped,
        outOfMonth,
        replaceMode: replaceExisting,
      });
    }

    let imported = 0;
    let importedDeposits = 0;
    let removed = 0;

    const store = await updateStore((s) => {
      if (replaceExisting) {
        removed = removeFileMonthImports(s, month, fileSlugs);
      }

      const newTx: (Expense | Deposit)[] = [];
      for (const batch of batches) {
        const batchExpenses = buildImportExpenses(batch.rows, {
          month,
          fileLabel: batch.fileName,
          fileSlug: batch.slug,
        });
        for (const exp of batchExpenses) {
          if (!replaceExisting && s.transactions.some((t) => t.id === exp.id)) continue;
          applyExpenseToStore(s, exp);
          newTx.push(exp);
        }

        const batchDeposits = buildImportDeposits(batch.deposits, {
          month,
          fileLabel: batch.fileName,
          fileSlug: batch.slug,
        });
        for (const dep of batchDeposits) {
          if (!replaceExisting && s.transactions.some((t) => t.id === dep.id)) continue;
          newTx.push(dep);
        }
      }
      imported = newTx.filter((t) => t.type === "expense").length;
      importedDeposits = newTx.filter((t) => t.type === "deposit").length;
      s.transactions = [...newTx, ...s.transactions];
    });

    return NextResponse.json({
      ok: true,
      imported,
      importedDeposits,
      replaced: removed,
      total: summary.total,
      depositTotal: depositSummary.total,
      founderDeposits: depositSummary.founder,
      byBranch: summary.byBranch,
      depositByBranch: depositSummary.byBranch,
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
